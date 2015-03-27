"use strict";

var _ = require("underscore");
var jade = require("jade");
var createAnchor = require("./entries").createAnchor;
var getPackages = require("./vendor/amp/lib/get-packages");
var path = require('path');

var renderAmp = jade.compileFile(path.join(__dirname, "amp.jade"), { pretty: true });

module.exports = {
	getDocumentation: function (cb) {
		var modules = _.filter(getPackages(), p => !p.lodash);
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
