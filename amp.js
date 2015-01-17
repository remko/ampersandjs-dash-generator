/* global __dirname */

"use strict";

var _ = require("underscore");
var jade = require("jade");
var createAnchor = require("./entries").createAnchor;
var getPackages = require("./vendor/amp/lib/get-packages");

var renderAmp = jade.compileFile(__dirname + "/amp.jade", { pretty: true });

module.exports = {
	getDocumentation: function (cb) {
		var modules = getPackages();
		var entries = [{ name: "amp", type: "Module", module: "amp", anchor: "" }];
		_.each(modules, function (module) {
			var entry = {
				name: module.camelCaseName, 
				type: "Function", 
				module: "amp", 
				anchor: module.name
			};
			entries.push(entry);
			module.dashAnchor = createAnchor(entry);
		});

		var html = renderAmp({modules: modules});
		cb(null, { pages: [{ name: "amp", html: html}], entries: entries });
	}
};
