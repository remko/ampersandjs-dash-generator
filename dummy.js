'use strict';

module.exports = {
	getDocumentation() {
		return new Promise(resolve => { 
			resolve({ pages: [], entries: [] });
		});
	}
};
