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

var DOCSET_DIR = __dirname + "/" + config.name + ".docset";

////////////////////////////////////////////////////////////////////////////////
// Helpers
////////////////////////////////////////////////////////////////////////////////

function capitalize(string) {
  return string.charAt(0).toUpperCase() + string.substring(1);
}

function toc2indexEntries(toc, module, isClass) {
	var indexEntries = [];
	indexEntries.push({name: module, type: "Module", anchor: "", module: module});
	if (isClass) {
		var className = capitalize(toCamelCase(module));
		indexEntries.push({name: className, type: "Class", anchor: "", module: module});

		toc.forEach(function (entry) {
			if (entry.depth === 3) {
				if (!entry.text.match(/.*<code>/)) {
					return;
				}
				var name = entry.text
					.replace(/\s+<code>.*/, "")
					.replace(/\/.*/, "");
				var type;
				if (name.match(/^constructor/)) {
					name = className;
					type = "Constructor";
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

var renderModule = jade.compileFile(__dirname + "/module.jade", { pretty: true });
var renderIndex = jade.compileFile(__dirname + "/index.jade", { pretty: true });
////////////////////////////////////////////////////////////////////////////////

fsExtra.removeSync(DOCSET_DIR);

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
		// Not the most elegant or efficient solution, but who cares?
		modules.forEach(function (otherModule) {
			module.html = module.html
				.replace("href=\"#" + otherModule.title + "\"", "href=\"" + otherModule.title + ".html\"")
				.replace("href=\"http://ampersandjs.com/docs/#" + otherModule.title + "\"", "href=\"" + otherModule.title + ".html\"")
				.replace("href=\"http://github.com/ampersandjs/" + otherModule.title + "\"", "href=\"" + otherModule.title + ".html\"")
				.replace("href=\"https://github.com/ampersandjs/" + otherModule.title + "\"", "href=\"" + otherModule.title + ".html\"");
		});
		
		// Write the documentation file
		fsExtra.outputFileSync(
			DOCSET_DIR + "/Contents/Resources/Documents/" + module.title + ".html", 
			renderModule({module: module}));

		// Insert entries into the index
		var isClass = _.contains(config.classModules, module.title);
		var entries = toc2indexEntries(module.toc, module.title, isClass);
		entries.forEach(function (entry) {
			db.run("INSERT OR IGNORE INTO searchIndex(name, type, path) VALUES (?, ?, ?)", 
				entry.name, entry.type, module.title + ".html#" + entry.anchor);
		});
		allEntries = allEntries.concat(entries);
	});

	// Generate index.html
	fsExtra.outputFileSync(
		DOCSET_DIR + "/Contents/Resources/Documents/index.html",
		renderIndex({title: config.name, entries: _.groupBy(allEntries, 'type')}));

	// Tar everything up into a tarball
	fstream.Reader({ path: DOCSET_DIR, type: "Directory"})
		.pipe(tar.Pack({noProprietary: true}))
		.pipe(zlib.createGzip())
		.pipe(fs.createWriteStream(config.name + ".tgz"));

	db.close();
});
