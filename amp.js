'use strict';

const _ = require('underscore');
const jade = require('jade');
const createAnchor = require('./entries').createAnchor;
const getPackages = require('./vendor/amp/lib/get-packages');
const path = require('path');

const renderAmp = jade.compileFile(path.join(__dirname, 'amp.jade'), { pretty: true });

module.exports = {
	getDocumentation (cb) {
		const modules = _.filter(getPackages(), p => !p.lodash);
		const entries = [{ name: 'amp', type: 'Module', module: 'amp', anchor: '' }];
		_.each(modules, module => {
			const entry = {
				name: module.camelCaseName, 
				type: 'Function', 
				module: 'amp', 
				anchor: module.name
			};
			module.dashAnchor = createAnchor(entry);
			entries.push(entry);
		});

		const html = renderAmp({modules});
		cb(null, { pages: [{ name: 'amp', html}], entries });
	}
};
