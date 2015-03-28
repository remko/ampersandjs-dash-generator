/* eslint no-path-concat:0 */

'use strict';

const packageInfo = require('./package.json');
const config = packageInfo.config;
const _ = require('underscore');
const fsExtra = require('fs-extra');
const fs = require('fs');
const jade = require('jade');
const mustache = require('mustache');
const sqlite3 = require('sqlite3').verbose();
const tar = require('tar');
const fstream = require('fstream');
const zlib = require('zlib');
const jsdom = require('jsdom');
const S = require('string');
const strftime = require('strftime');

const ampersandModules = require('./ampersand-modules');
const ampersandGuides = require('./ampersand-guides');
const amp = require('./amp');

////////////////////////////////////////////////////////////////////////////////
// Helpers
////////////////////////////////////////////////////////////////////////////////

// Extract all links from a piece of HTML
function getLinks(html) {
	return new Promise((resolve, reject) => {
		jsdom.env({html, done: (errors, window) => {
			if (errors) { reject(errors); return; }
			const result = [];
			const links = window.document.querySelectorAll('a[href]');
			for (let i = 0; i < links.length; ++i) {
				result.push(links[i].href);
			}
			resolve(result);
		}});
	});
}

function fixLinks(html, modules, guides) {
	// Fix links in the html. 
	// Not the most elegant or efficient solution. Clean this up.
	const otherModules = _.sortBy(_.pluck(modules, 'title'), name => -name.length);
	otherModules.forEach(otherModule => {
		const replacements = [
			['href="#' + otherModule + '"', 'href="' + otherModule + '.html"'],

			['href="/docs#' + otherModule + '"', 'href="' + otherModule + '.html"'],
			['href="/docs#' + otherModule + '-', 'href="' + otherModule + '.html#' + otherModule + '-'],

			['href="/docs/#' + otherModule + '"', 'href="' + otherModule + '.html"'],
			['href="/docs/#' + otherModule + '-', 'href="' + otherModule + '.html#' + otherModule + '-'],

			['href="http://ampersandjs.com/docs/#' + otherModule + '"', 'href="' + otherModule + '.html"'],
			['href="http://ampersandjs.com/docs/#' + otherModule + '-', 'href="' + otherModule + '.html#' + otherModule + '-'],
			['href="http://ampersandjs.com/docs#' + otherModule + '"', 'href="' + otherModule + '.html"'],
			['href="http://ampersandjs.com/docs#' + otherModule + '-', 'href="' + otherModule + '.html#' + otherModule + '-'],

			['href="http://github.com/ampersandjs/' + otherModule + '"', 'href="' + otherModule + '.html"'],
			['href="https://github.com/ampersandjs/' + otherModule + '"', 'href="' + otherModule + '.html"'],
			['href="https://github.com/AmpersandJS/' + otherModule + '"', 'href="' + otherModule + '.html"']
		];
		_.each(replacements, replacement => {
			html = S(html).replaceAll(replacement[0], replacement[1]);
		});
	});

	const guideNames = _.sortBy(_.pluck(guides, 'name'), name => -name.length);
	guideNames.forEach(guideName => {
		const replacements = [
			['href="http://ampersandjs.com/learn/' + guideName + '/"', 'href="' + guideName + '.html"'],
			['href="http://ampersandjs.com/learn/' + guideName + '"', 'href="' + guideName + '.html"']
		];
		_.each(replacements, replacement => {
			html = S(html).replaceAll(replacement[0], replacement[1]);
		});
	});

	return html;
}

const renderIndex = jade.compileFile(__dirname + '/index.jade', { pretty: true });
const renderFeed = jade.compileFile(__dirname + '/feed.jade', { pretty: true });


////////////////////////////////////////////////////////////////////////////////


const DOCSET_DIR = __dirname + '/build/' + config.name + '.docset';
const FEED_DIR = __dirname + '/build/feed';
const USER_CONTRIBUTION_DIR = __dirname + '/build/user-contribution';

const timestamp = new Date();
const docsetVersion = `${strftime('%F', timestamp)}/${strftime('%F_%H:%M:%S', timestamp)}`;

fsExtra.removeSync(DOCSET_DIR);
fsExtra.removeSync(FEED_DIR);
fsExtra.removeSync(USER_CONTRIBUTION_DIR);

// Copy icon
fsExtra.copySync('icon@2x.png', DOCSET_DIR + '/icon.png');
fsExtra.copySync('style.css', DOCSET_DIR + '/Contents/Resources/Documents/style.css');

// Generate Info.plist
fsExtra.outputFileSync(
	DOCSET_DIR + '/Contents/Info.plist',
	mustache.render(fs.readFileSync('Info.plist.mustache', 'utf-8'), {
		id: config.id,
		name: config.name,
		family: config.id
	}));

// Create the database
fsExtra.ensureDirSync(DOCSET_DIR + '/Contents/Resources');
const db = new sqlite3.Database(DOCSET_DIR + '/Contents/Resources/docSet.dsidx');
db.run('CREATE TABLE searchIndex(id INTEGER PRIMARY KEY, name TEXT, type TEXT, path TEXT)');


const docs = [
	ampersandGuides.getDocumentation(),
	ampersandModules.getDocumentation(),
	amp.getDocumentation()
];
// docs = [ require('./dummy').getDocumentation(), require('./dummy').getDocumentation(), amp.getDocumentation()];

Promise.all(docs)
	.then(results => {
		const allEntries = _.flatten(_.pluck(results, 'entries'));
		const allPages = _.flatten(_.pluck(results, 'pages'));
		const [{pages: guidesPages}, {pages: modulesPages}] = results;
		
		_.each(allPages, page => {
			page.html = fixLinks(page.html, modulesPages, guidesPages);
			fsExtra.outputFileSync(
				DOCSET_DIR + '/Contents/Resources/Documents/' + page.name + '.html', 
				page.html);
		});

		// Insert entries into database
		allEntries.forEach(entry => {
			db.run('INSERT OR IGNORE INTO searchIndex(name, type, path) VALUES (?, ?, ?)', 
				entry.name, entry.type, entry.module + '.html#' + entry.anchor);
		});

		db.close();

		// Generate index.html
		fsExtra.outputFileSync(
			DOCSET_DIR + '/Contents/Resources/Documents/index.html',
			renderIndex({title: config.name, entries: _.groupBy(allEntries, 'type')}));

		// Render the feed
		const feed = FEED_DIR + '/' + config.name + '.xml';
		fsExtra.outputFileSync(
			feed,
			mustache.render(fs.readFileSync('feed.xml.mustache', 'utf-8'), {
				version: docsetVersion,
				url: config.feedBaseURL + '/' + config.name + '.tgz'
			}));
		fsExtra.outputFileSync(
			FEED_DIR + '/' + config.name + '.html',
			renderFeed({
				feed: 'dash-feed://' + encodeURIComponent(config.feedBaseURL + '/' + config.name + '.xml'),
				name: config.name
			}));

		// Tar everything up into a tarball
		fstream.Reader({ path: DOCSET_DIR, type: 'Directory'})
			.pipe(tar.Pack({noProprietary: true}))
			.pipe(zlib.createGzip())
			.pipe(fs.createWriteStream(FEED_DIR + '/' + config.name + '.tgz'));

		// Generate a Dash user contribution dir
		fsExtra.outputFileSync(
			USER_CONTRIBUTION_DIR + '/docset.json',
			mustache.render(fs.readFileSync('docset.json.mustache', 'utf-8'), {
				name: config.name,
				author: packageInfo.author.name,
				authorLink: packageInfo.author.url,
				version: docsetVersion
			}));
		fsExtra.copySync('icon@2x.png', USER_CONTRIBUTION_DIR + '/icon@2x.png');
		fsExtra.copySync('icon.png', USER_CONTRIBUTION_DIR + '/icon.png');
		fstream.Reader({ path: DOCSET_DIR, type: 'Directory'})
			.pipe(tar.Pack({noProprietary: true}))
			.pipe(zlib.createGzip())
			.pipe(fs.createWriteStream(USER_CONTRIBUTION_DIR + '/' + config.name + '.tgz'));

		// Collect external links
		return Promise.all(allPages.map(({html}) => getLinks(html)))
			.then(results => {
				const externalLinks = _.uniq(_.flatten(results))
					.map(link => link.toLowerCase())
					.filter(link =>
						link.match(/^https?:\/\/github.com\/ampersandjs/) 
							? !link.match(/\/ampersandjs\/.*\.js$/) 
								&& !link.match(/\/ampersandjs\/ampersand\/(blob|issues)/)
							: false);
				if (externalLinks.length > 0) {
					console.warn('Warning: External links found:');
					externalLinks.forEach(link => console.log('- ' + link));
				}
			});
	})
	.catch(err => {
		console.error('ERROR:', err);
	});
