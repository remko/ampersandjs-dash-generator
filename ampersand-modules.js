/* eslint no-path-concat:0, no-shadow: 0 */

"use strict";

const moduleDetails = require('module-details');
const async = require("async");
const packageInfo = require("./package.json");
const config = packageInfo.config;
const _ = require("underscore");
const jade = require("jade");
const createAnchor = require("./entries").createAnchor;
const S = require("string");

const renderModule = jade.compileFile(__dirname + "/module.jade", { pretty: true });

// Fetch module information from NPM
function getModules(cb) {
	const moduleNames = config.modules.concat(config.classModules);
	async.map(moduleNames, function (module, cb) {
			moduleDetails(module, { sectionsToRemove: config.sectionsToRemove }, cb);
		},
		function (err, modules) {
			if (err) { throw err; }
			cb(modules);
		});
}

function capitalize(string) {
	return string.charAt(0).toUpperCase() + string.substring(1);
}

// Convert NPM TOC documentation to index entries
function toc2indexEntries(toc, module, isClass) {
	const indexEntries = [];
	indexEntries.push({name: module, type: "Module", anchor: "", module: module});
	if (isClass) {
		const className = capitalize(S(module).camelize().s);
		indexEntries.push({name: className, type: "Class", anchor: "", module: module});

		toc.forEach(function (entry) {
			if (entry.depth === 3) {
				let name = entry.text
					.replace(/\s+<code>.*/, "")
					.replace(/\/.*/, "")
					.replace(/^\w+\.extend/, ".extend"); // Subcollection-style

				let type;
				if (name.match(/proxied ES5|underscore methods/)) {
					return;
				}
				else if (name.match(/^constructor/) || name.match(/^new /)) {
					type = "Constructor";
					name = className;
				}
				else if (name.match(/^\./)) {
					// ampersand-subcollection style
					if (name.match(/\(/)) {
						type = "Method";
						name = className + name.replace(/\(.*/, "");
					}
					else {
						type = "Property";
						name = className + name;
					}
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

function getDocumentation (cb) {
	getModules(function (modules) {
		let allEntries = [];
		modules.forEach(function (module) {
			// Insert entries into the index
			const isClass = _.contains(config.classModules, module.name);
			const entries = toc2indexEntries(module.toc, module.name, isClass);

			// Add TOC anchors to the module HTML
			entries.forEach(function (entry) {
				module.html = module.html.replace(
					"<a name=\"" + entry.anchor, 
					createAnchor(entry) + 
					"<a name=\"" + entry.anchor);
			});

			module.html = renderModule({module: module});
			allEntries = allEntries.concat(entries);
		});
		cb(null, {pages: modules, entries: allEntries});
	});
}

module.exports = { getDocumentation };
