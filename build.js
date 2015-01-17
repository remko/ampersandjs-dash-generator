/* global __dirname */

"use strict";

var moduleDetails = require('module-details');
var packageInfo = require("./package.json");
var config = packageInfo.config;
var async = require("async");
var _ = require("underscore");
var fsExtra = require("fs-extra");
var fs = require("fs");
var jade = require("jade");
var mustache = require("mustache");
var sqlite3 = require('sqlite3').verbose();
var tar = require("tar");
var fstream = require("fstream");
var zlib = require("zlib");
var jsdom = require("jsdom");
var strftime = require("strftime");
var S = require("string");

var ampersandModules = require("./ampersand-modules.js");
var ampersandGuides = require("./ampersand-guides");

////////////////////////////////////////////////////////////////////////////////
// Helpers
////////////////////////////////////////////////////////////////////////////////

// Extract all links from a piece of HTML
function getLinks(html, cb) {
	jsdom.env({html: html, done: function (errors, window) {
		if (errors) { return cb(errors); }
		var result = [];
		var links = window.document.querySelectorAll("a[href]");
		for (var i = 0; i < links.length; ++i) {
			result.push(links[i].href);
		}
		cb(null, result);
	}});
}

function fixLinks(html, modules, guides) {
	// Fix links in the html. 
	// Not the most elegant or efficient solution. Clean this up.
	var otherModules = _.sortBy(_.pluck(modules, 'title'), function (name) { return -name.length; });
	otherModules.forEach(function (otherModule) {
		var replacements = [
			["href=\"#" + otherModule + "\"", "href=\"" + otherModule + ".html\""],

			["href=\"/docs#" + otherModule + "\"", "href=\"" + otherModule + ".html\""],
			["href=\"/docs#" + otherModule + "-", "href=\"" + otherModule + ".html#" + otherModule + "-"],

			["href=\"/docs/#" + otherModule + "\"", "href=\"" + otherModule + ".html\""],
			["href=\"/docs/#" + otherModule + "-", "href=\"" + otherModule + ".html#" + otherModule + "-"],

			["href=\"http://ampersandjs.com/docs/#" + otherModule + "\"", "href=\"" + otherModule + ".html\""],
			["href=\"http://ampersandjs.com/docs/#" + otherModule + "-", "href=\"" + otherModule + ".html#" + otherModule + "-"],
			["href=\"http://ampersandjs.com/docs#" + otherModule + "\"", "href=\"" + otherModule + ".html\""],
			["href=\"http://ampersandjs.com/docs#" + otherModule + "-", "href=\"" + otherModule + ".html#" + otherModule + "-"],

			["href=\"http://github.com/ampersandjs/" + otherModule + "\"", "href=\"" + otherModule + ".html\""],
			["href=\"https://github.com/ampersandjs/" + otherModule + "\"", "href=\"" + otherModule + ".html\""],
			["href=\"https://github.com/AmpersandJS/" + otherModule + "\"", "href=\"" + otherModule + ".html\""]
		];
		_.each(replacements, function (replacement) {
			html = S(html).replaceAll(replacement[0], replacement[1]);
		});
	});

	var guideNames = _.sortBy(_.pluck(guides, 'name'), function (name) { return -name.length; });
	guideNames.forEach(function (guideName) {
		var replacements = [
			["href=\"http://ampersandjs.com/learn/" + guideName + "/\"", "href=\"" + guideName + ".html\""],
			["href=\"http://ampersandjs.com/learn/" + guideName + "\"", "href=\"" + guideName + ".html\""]
		];
		_.each(replacements, function (replacement) {
			html = S(html).replaceAll(replacement[0], replacement[1]);
		});
	});

	return html;
}

function createAnchor(entry) {
	return "<a name=\"//apple_ref/cpp/" + entry.type + "/" + encodeURIComponent(entry.name.replace(/^\w+\./, "")) + "\" class=\"dashAnchor\"></a>";
}

var renderIndex = jade.compileFile(__dirname + "/index.jade", { pretty: true });
var renderFeed = jade.compileFile(__dirname + "/feed.jade", { pretty: true });


////////////////////////////////////////////////////////////////////////////////


var DOCSET_DIR = __dirname + "/build/" + config.name + ".docset";
var FEED_DIR = __dirname + "/build/feed";
var USER_CONTRIBUTION_DIR = __dirname + "/build/user-contribution";

var timestamp = new Date();
var docsetVersion = strftime("%F", timestamp) + "/" + strftime("%F_%H:%M:%S", timestamp);

fsExtra.removeSync(DOCSET_DIR);
fsExtra.removeSync(FEED_DIR);
fsExtra.removeSync(USER_CONTRIBUTION_DIR);

// Copy icon
fsExtra.copySync("icon@2x.png", DOCSET_DIR + "/icon.png");
fsExtra.copySync("style.css", DOCSET_DIR + "/Contents/Resources/Documents/style.css");

// Generate Info.plist
fsExtra.outputFileSync(
	DOCSET_DIR + "/Contents/Info.plist",
	mustache.render(fs.readFileSync("Info.plist.mustache", "utf-8"), {
		id: config.id,
		name: config.name,
		family: config.id
	}));

// Create the database
fsExtra.ensureDirSync(DOCSET_DIR + "/Contents/Resources");
var db = new sqlite3.Database(DOCSET_DIR + "/Contents/Resources/docSet.dsidx");
db.run("CREATE TABLE searchIndex(id INTEGER PRIMARY KEY, name TEXT, type TEXT, path TEXT)");

async.series([
		ampersandGuides.getDocumentation,
		ampersandModules.getDocumentation
], function (err, results) {
	if (err) { throw err; }
	var allEntries = _.flatten(_.pluck(results, 'entries'));
	var allPages = _.flatten(_.pluck(results, 'pages'));
	var guidesPages = results[0].pages;
	var modulesPages = results[1].pages;
	
	_.each(allPages, function (page) {
		page.html = fixLinks(page.html, modulesPages, guidesPages);
		fsExtra.outputFileSync(
			DOCSET_DIR + "/Contents/Resources/Documents/" + page.name + ".html", 
			page.html);
	});

	// Insert entries into database
	allEntries.forEach(function (entry) {
		db.run("INSERT OR IGNORE INTO searchIndex(name, type, path) VALUES (?, ?, ?)", 
			entry.name, entry.type, entry.module + ".html#" + entry.anchor);
	});

	db.close();

	// Generate index.html
	fsExtra.outputFileSync(
		DOCSET_DIR + "/Contents/Resources/Documents/index.html",
		renderIndex({title: config.name, entries: _.groupBy(allEntries, 'type')}));

	// Render the feed
	var feed = FEED_DIR + "/" + config.name + ".xml";
	fsExtra.outputFileSync(
		feed,
		mustache.render(fs.readFileSync("feed.xml.mustache", "utf-8"), {
			version: docsetVersion,
			url: config.feedBaseURL + "/" + config.name + ".tgz"
		}));
	fsExtra.outputFileSync(
		FEED_DIR + "/" + config.name + ".html",
		renderFeed({
			feed: "dash-feed://" + encodeURIComponent(config.feedBaseURL + "/" + config.name + ".xml"),
			name: config.name
		}));

	// Tar everything up into a tarball
	fstream.Reader({ path: DOCSET_DIR, type: "Directory"})
		.pipe(tar.Pack({noProprietary: true}))
		.pipe(zlib.createGzip())
		.pipe(fs.createWriteStream(FEED_DIR + "/" + config.name + ".tgz"));

	// Generate a Dash user contribution dir
	fsExtra.outputFileSync(
		USER_CONTRIBUTION_DIR + "/docset.json",
		mustache.render(fs.readFileSync("docset.json.mustache", "utf-8"), {
			name: config.name,
			author: packageInfo.author.name,
			authorLink: packageInfo.author.url,
			version: docsetVersion
		}));
	fsExtra.copySync("icon@2x.png", USER_CONTRIBUTION_DIR + "/icon@2x.png");
	fsExtra.copySync("icon.png", USER_CONTRIBUTION_DIR + "/icon.png");
	fstream.Reader({ path: DOCSET_DIR, type: "Directory"})
		.pipe(tar.Pack({noProprietary: true}))
		.pipe(zlib.createGzip())
		.pipe(fs.createWriteStream(USER_CONTRIBUTION_DIR + "/" + config.name + ".tgz"));

	// Collect external links
	async.map(allPages, function (module, cb) {
			getLinks(module.html, cb);
		}, 
		function (err, results) {
			var externalLinks = _.chain(_.uniq(_.flatten(results)))
				.map(function (link) { return link.toLowerCase(); })
				.filter(function (link) { return link.indexOf("file:") !== 0; })
				.filter(function (link) { return link.indexOf("mailto:") !== 0; })
				.reject(function (link) { return link.match(/^https?:\/\/(www.)?npmjs.org/); })
				.reject(function (link) { return link.match(/^http:\/\/underscorejs.org\//); })
				.reject(function (link) { return link.match(/^http:\/\/backbonejs.org\//); })
				.reject(function (link) { return link.match(/^https?:\/\/gitter.im\//); })
				.reject(function (link) { return link.match(/^https?:\/\/trello.com\//); })
				.reject(function (link) { return link.match(/^http:\/\/andyet.com\//); })
				.reject(function (link) { return link.match(/^http:\/\/handlebarsjs.com\//); })
				.reject(function (link) { return link.match(/^https?:\/\/nodejs.org\//); })
				.reject(function (link) { return link.match(/^https?:\/\/semver.org\//); })
				.reject(function (link) { return link.match(/^https?:\/\/nodesecurity.io\//); })
				.reject(function (link) { return link.match(/^https?:\/\/browserify.org\//); })
				.reject(function (link) { return link.match(/^https?:\/\/gruntjs.com\//); })
				.reject(function (link) { return link.match(/^https?:\/\/gulpjs.com\//); })
				.reject(function (link) { return link.match(/^https?:\/\/jade-lang.com\//); })
				.reject(function (link) { return link.match(/^https:\/\/developer.mozilla.org\//); })
				.reject(function (link) { return link.match(/^https?:\/\/twitter.com\//); })
				.reject(function (link) { return link.match(/^https?:\/\/github.com\/ampersandjs\/.*\.js$/); })
				.reject(function (link) { return link.match(/^https?:\/\/github.com\/(jmreidy|deepak1556|chrisdickinson|raynos|substack|janl|latentflip|domenic|juliangruber|jashkenas|henrikjoreteg|gruntjs|ampersandjs\/ampersand\/issues|ampersandjs\/ampersand\/blob)/); })
				.difference(["https://github.com/ampersandjs"])
				.value();
			if (externalLinks.length > 0) {
				console.warn("Warning: External links found:");
				externalLinks.forEach(function (link) {
					console.log("- " + link);
				});
			}
		});
});
