/* global __dirname */

"use strict";

var moduleDetails = require('module-details');
var config = require("./package.json").config;
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
var toCamelCase = require("to-camel-case");
var jsdom = require("jsdom");
var strftime = require("strftime");

////////////////////////////////////////////////////////////////////////////////
// Helpers
////////////////////////////////////////////////////////////////////////////////

function capitalize(string) {
  return string.charAt(0).toUpperCase() + string.substring(1);
}

// Convert NPM TOC documentation to index entries
function toc2indexEntries(toc, module, isClass) {
	var indexEntries = [];
	indexEntries.push({name: module, type: "Module", anchor: "", module: module});
	if (isClass) {
		var className = capitalize(toCamelCase(module));
		indexEntries.push({name: className, type: "Class", anchor: "", module: module});

		toc.forEach(function (entry) {
			if (entry.depth === 3) {
				var name = entry.text
					.replace(/\s+<code>.*/, "")
					.replace(/\/.*/, "");

				var type;
				if (name.match(/proxied ES5|underscore methods/)) {
					return;
				}
				else if (name.match(/^constructor/)) {
					type = "Constructor";
					name = className;
				}
				else if (entry.text.match(/extend\(/) && name !== "extend" 
						|| !entry.text.match(/<code>.*\(/) 
						|| _.contains(["url", "urlRoot"], name)) {
					type = "Property";
					name = className + "." + name;
				}
				else {
					type = "Method";
					name = className + "." + name;
				}
				indexEntries.push({name: name, type: type, anchor: entry.linkText, module: module});
			}
		});
	}
	return indexEntries;
}

// Fetch module information from NPM
function getModules(cb) {
	var modules = {};
	async.map(config.modules.concat(config.classModules), function (module, cb) {
			moduleDetails(module, { sectionsToRemove: config.sectionsToRemove }, cb);
		},
		function (err, modules) {
			if (err) { throw err; }
			cb(modules);
		});
}

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

var renderModule = jade.compileFile(__dirname + "/module.jade", { pretty: true });
var renderIndex = jade.compileFile(__dirname + "/index.jade", { pretty: true });
var renderFeed = jade.compileFile(__dirname + "/feed.jade", { pretty: true });


////////////////////////////////////////////////////////////////////////////////


var DOCSET_DIR = __dirname + "/" + config.name + ".docset";
var FEED_DIR = __dirname + "/feed";

fsExtra.removeSync(DOCSET_DIR);
fsExtra.removeSync(FEED_DIR);

// Copy icon
fsExtra.copySync("icon.png", DOCSET_DIR + "/icon.png");
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

// Process modules
getModules(function (modules) {
	var allEntries = [];
	modules.forEach(function (module) {
		// Fix links in the html. 
		// Not the most elegant or efficient solution. Clean this up.
		var otherModules = _.sortBy(_.pluck(modules, 'title'), function (name) { return -name.length; });
		otherModules.forEach(function (otherModule) {
			module.html = module.html
				.replace("href=\"#" + otherModule + "\"", "href=\"" + otherModule + ".html\"")
				.replace("href=\"http://ampersandjs.com/docs/#" + otherModule + "\"", "href=\"" + otherModule + ".html\"")
				.replace("href=\"http://ampersandjs.com/docs/#" + otherModule + "-", "href=\"" + otherModule + ".html#" + otherModule + "-")
				.replace("href=\"http://ampersandjs.com/docs#" + otherModule + "\"", "href=\"" + otherModule + ".html\"")
				.replace("href=\"http://ampersandjs.com/docs#" + otherModule + "-", "href=\"" + otherModule + ".html#" + otherModule + "-")
				.replace("href=\"http://github.com/ampersandjs/" + otherModule + "\"", "href=\"" + otherModule + ".html\"")
				.replace("href=\"https://github.com/ampersandjs/" + otherModule + "\"", "href=\"" + otherModule + ".html\"")
				.replace("href=\"https://github.com/AmpersandJS/" + otherModule + "\"", "href=\"" + otherModule + ".html\"");
		});
		
		// Insert entries into the index
		var isClass = _.contains(config.classModules, module.name);
		var entries = toc2indexEntries(module.toc, module.name, isClass);
		entries.forEach(function (entry) {
			db.run("INSERT OR IGNORE INTO searchIndex(name, type, path) VALUES (?, ?, ?)", 
				entry.name, entry.type, module.name + ".html#" + entry.anchor);
		});

		// Add TOC anchors to the module HTML
		entries.forEach(function (entry) {
			module.html = module.html.replace(
				"<a name=\"" + entry.anchor, 
				"<a name=\"//apple_ref/cpp/" + entry.type + "/" + encodeURIComponent(entry.name.replace(/^\w+\./, "")) + "\" class=\"dashAnchor\"></a>" +
				"<a name=\"" + entry.anchor);
		});

		// Write the documentation file
		fsExtra.outputFileSync(
			DOCSET_DIR + "/Contents/Resources/Documents/" + module.name + ".html", 
			renderModule({module: module}));

		allEntries = allEntries.concat(entries);
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
			version: "/" + strftime("%F-%H:%M:%S", new Date()),
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

	// Collect external links
	async.map(modules, function (module, cb) {
			getLinks(module.html, cb);
		}, 
		function (err, results) {
			var externalLinks = _.chain(_.uniq(_.flatten(results)))
				.map(function (link) { return link.toLowerCase(); })
				.filter(function (link) { return link.indexOf("file:") !== 0; })
				.reject(function (link) { return link.match(/^http:\/\/ampersandjs.com\/learn/); })
				.reject(function (link) { return link.match(/^http:\/\/underscorejs.org\//); })
				.reject(function (link) { return link.match(/^http:\/\/backbonejs.org\//); })
				.reject(function (link) { return link.match(/^https:\/\/developer.mozilla.org\//); })
				.reject(function (link) { return link.match(/^http:\/\/twitter.com\//); })
				.difference([
					"https://github.com/henrikjoreteg/key-tree-store",
					"https://www.npmjs.org/package/backbone-events-standalone",
					"http://github.com/raynos/xhr",
					"https://github.com/raynos/xhr",
					"https://github.com/substack/tape",
					"https://github.com/juliangruber/tape-run"
				])
				.value();
			if (externalLinks.length > 0) {
				console.warn("Warning: External links found:");
				externalLinks.forEach(function (link) {
					console.log("- " + link);
				});
			}
		});
});
