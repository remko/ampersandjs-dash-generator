'use strict';

const moduleDetails = require('module-details');
const packageInfo = require('./package.json');
const config = packageInfo.config;
const _ = require('underscore');
const jade = require('jade');
const createAnchor = require('./entries').createAnchor;
const path = require('path');
const S = require('string');
const Q = require('q');

const renderModule = jade.compileFile(path.join(__dirname, '/module.jade'), { pretty: true });

// Fetch module information from NPM
function getModules() {
	const moduleNames = config.modules.concat(config.classModules);
	return Promise.all(moduleNames.map(module => 
		Q.nfcall(moduleDetails, module, { sectionsToRemove: config.sectionsToRemove })
	));
}

function capitalize(string) {
	return string.charAt(0).toUpperCase() + string.substring(1);
}

// Convert NPM TOC documentation to index entries
function toc2indexEntries(toc, module, isClass) {
	const indexEntries = [];
	indexEntries.push({name: module, type: 'Module', anchor: '', module});
	if (isClass) {
		const className = capitalize(S(module).camelize().s);
		indexEntries.push({name: className, type: 'Class', anchor: '', module});

		toc.forEach(entry => {
			if (entry.depth === 3) {
				let name = entry.text
					.replace(/\s+<code>.*/, '')
					.replace(/\/.*/, '')
					.replace(/^\w+\.extend/, '.extend') // Subcollection-style
					.replace(/\s+- \[.*/, ''); // SelectView-style

				let type;
				if (name.match(/proxied ES5|underscore methods/)) {
					return;
				}
				else if (module === 'ampersand-select-view' && name.match(/\(/)) {
					type = 'Method';
					name = className + '.' + name.replace(/\(.*/, '');
				}
				else if (name.match(/^constructor/) || name.match(/^new /)) {
					type = 'Constructor';
					name = className;
				}
				else if (name.match(/^\./)) {
					// ampersand-subcollection style
					if (name.match(/\(/)) {
						type = 'Method';
						name = className + name.replace(/\(.*/, '');
					}
					else {
						type = 'Property';
						name = className + name;
					}
				}
				else if (entry.text.match(/extend\(/) && name !== 'extend' 
						|| !entry.text.match(/<code>.*\(/) 
						|| _.contains(['url', 'urlRoot'], name)) {
					type = 'Property';
					name = className + '.' + name;
				}
				else {
					type = 'Method';
					name = className + '.' + name;
				}
				indexEntries.push({name, type, anchor: entry.linkText, module});
			}
		});
	}
	return indexEntries;
}

function getDocumentation () {
	return getModules()
		.then(modules => {
			let allEntries = [];
			modules.forEach(module => {
				// Insert entries into the index
				const isClass = _.contains(config.classModules, module.name);
				const entries = toc2indexEntries(module.toc, module.name, isClass);

				// Add TOC anchors to the module HTML
				entries.forEach(entry => {
					module.html = module.html.replace(
						'<a name="' + entry.anchor, 
						createAnchor(entry) + 
						'<a name="' + entry.anchor);
				});

				module.html = renderModule({module});
				allEntries = allEntries.concat(entries);
			});
			return {pages: modules, entries: allEntries};
		});
}

module.exports = { getDocumentation };
