'use strict';

function createAnchor(entry) {
	return '<a name="//apple_ref/cpp/' + entry.type + '/' + encodeURIComponent(entry.name.replace(/^\w+\./, '')) + '" class="dashAnchor"></a>';
}

module.exports = { createAnchor };
