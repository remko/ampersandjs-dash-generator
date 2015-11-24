'use strict';

const GitHubApi = require('github');
const packageInfo = require('./package.json');
const S = require('string');
const metaMarked = require('meta-marked');
const jade = require('jade');
const createAnchor = require('./entries').createAnchor;
const path = require('path');
const Q = require('q');

const renderGuide = jade.compileFile(path.join(__dirname, '/guide.jade'), { pretty: true });

function getGuides() {
	// Log into GitHub
	const github = new GitHubApi({
		version: '3.0.0',
		headers: { 'user-agent': packageInfo.name }
	});
	if (process.env.GITHUB_USER && process.env.GITHUB_PASS) {
		github.authenticate({
			type: 'basic',
			username: process.env.GITHUB_USER,
			password: process.env.GITHUB_PASS
		});
	}
	const getGitHubContent = Q.nbind(github.repos.getContent, github.repos);

	//  Get guides from GitHub
	const learnRepo = { user: 'AmpersandJS', repo: 'ampersandjs.com' };
	return getGitHubContent(Object.assign({}, learnRepo, { path: '/learn_markdown'}))
		.then(entries => {
			entries = entries
				.filter(e => S(e.name).endsWith('.md'))
				.filter(e => !packageInfo.config.guidesToRemove.some(guideToRemove =>
					e.name === guideToRemove + '.md'
				));
			return Promise.all(entries.map(entry => getGitHubContent(
				Object.assign({}, learnRepo, { path: entry.path })
			)));
		})
		.then(entries => entries
				.map(entry => {
					const markdown = new Buffer(entry.content, 'base64').toString('utf-8');
					const marked = metaMarked(markdown);
					return Object.assign(entry, {
						name: entry.name.slice(0, -3), 
						html: marked.html, 
						title: marked.meta.pagetitle, 
						order: marked.meta.order
					});
				})
				.sort((a, b) => {
					if (a.order < b.order) { return -1; }
					if (a.order > b.order) { return 1; }
					return 0;	
				})
		);
}

function getDocumentation() {
	return getGuides()
		.then(guides => {
			const allEntries = [];
			guides.forEach(guide => {
				const entry = {name: guide.title, module: guide.name, type: 'Guide', anchor: ''};
				guide.html = createAnchor(entry) + guide.html;
				guide.html = renderGuide({guide: guide});
				allEntries.push(entry);
			});
			return { pages: guides, entries: allEntries};
		});
}

module.exports = { getDocumentation };
