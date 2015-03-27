/* eslint no-path-concat:0, no-shadow: 0 */

"use strict";

const GitHubApi = require("github");
const packageInfo = require("./package.json");
const async = require("async");
const _ = require("underscore");
const S = require("string");
const metaMarked = require("meta-marked");
const jade = require("jade");
const createAnchor = require("./entries").createAnchor;

const renderGuide = jade.compileFile(__dirname + "/guide.jade", { pretty: true });

function getGuides(cb) {
	const github = new GitHubApi({
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
	const learnRepo = { user: "AmpersandJS", repo: "ampersandjs.com" };
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
				const result = results
					.map(function (entry) {
						const marked = metaMarked(entry.markdown);
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

function getDocumentation(cb) {
	getGuides(function (err, guides) {
		if (err) { cb(err); return; }
		const allEntries = [];
		guides.forEach(function (guide) {
			const entry = {name: guide.title, module: guide.name, type: "Guide", anchor: ""};
			guide.html = createAnchor(entry) + guide.html;
			guide.html = renderGuide({guide: guide});
			allEntries.push(entry);
		});
		cb(null, { pages: guides, entries: allEntries});
	});
}

module.exports = { getDocumentation };
