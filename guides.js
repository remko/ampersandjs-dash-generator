"use strict";

var GitHubApi = require("github");
var packageInfo = require("./package.json");
var async = require("async");
var _ = require("underscore");
var S = require("string");
var metaMarked = require("meta-marked");

function getGuides(cb) {
	var github = new GitHubApi({
			version: "3.0.0",
			headers: { "user-agent": packageInfo.name }
	});
	if (process.env.GITHUB_USER && process.env.GITHUB_PASS) {
		github.authenticate({
			type: "basic",
			username: process.env.GITHUB_USER,
			password: process.env.GITHUB_PASS
		});
	}
	var learnRepo = { user: "AmpersandJS", repo: "ampersandjs.com" };
	github.repos.getContent(
		_.extend({}, learnRepo, { path: "/learn_markdown"}),
		function (err, entries) {
			if (err) { throw err; }
			entries = entries
				.filter(function (e) { return S(e.name).endsWith(".md"); })
				.filter(function (e) { return !_.any(packageInfo.config.guidesToRemove, function (guideToRemove) {
					return e.name === guideToRemove + ".md";
				}); });
			async.map(entries, function (entry, cb) {
				github.repos.getContent(
					_.extend({}, learnRepo, { path: entry.path }), 
					function (err, body) {
						if (err) { cb(err); return; }
						cb(null, { 
							name: entry.name.slice(0, -3), 
							markdown: new Buffer(body.content, 'base64').toString('utf-8')
						});
					});
			}, function (err, results) {
				if (err) { cb(err); return; }
				var result = results
					.map(function (entry) {
						var marked = metaMarked(entry.markdown);
						return _.extend(entry, {
							html: marked.html, 
							title: marked.meta.pagetitle, 
							order: marked.meta.order
						});
					})
					.sort(function (a, b) {
						if (a.order < b.order) { return -1; }
						if (a.order > b.order) { return 1; }
						return 0;	
					});
				cb(null, result);
			});
	});
}

module.exports = {
	getGuides: getGuides
};