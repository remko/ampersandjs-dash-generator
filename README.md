# [ampersandjs-dash-generator: Generate a Dash docset for Ampersand.js](https://el-tramo.be/ampersandjs-dash-generator)

Generates a [Dash](http://kapeli.com/dash) docset of all [Ampersand.js](http://ampersandjs.com) modules.

If you are just interested in installing the docset (and not in building it yourself), just
[click here to install the docset](http://cdn.el-tramo.be/dash/Ampersand.js.html).
This docset is bundled as a user contribution with Dash, which is updated regularly, 
but the link above will always get you the latest version.

## Installation

To install the prerequisites, run

		npm install


## Usage

To build the docset, run

		npm run build

Use the resulting docset by adding the `.docset` to the *Docsets* tab of Dash.

The build command also generates a Dash feed in `feed`. The `.html` file in the `feed` dir contains the Dash URL,
which will install the docset when it is opened.
