var rp = require('request-promise');
var cheerio = require('cheerio');
var fs = require('fs');
var _ = require('lodash');
var http = require('http');
var https = require('https');
var readline = require('readline');
var size = require('request-image-size');

fs.unlink(__dirname + "/img-sizes.txt", function(err) {
	//console.log(err);
});

var rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.setPrompt("Enter the url to search: ");
rl.prompt();

rl
.on('line', function(urlToSearch) {
	searchUrlAndParseForImages(urlToSearch)
	.then(logTotalImages)
	.then(logImagesWithQueryParams)
	.then(evaluateAllImages)
	.then(collectImageRequestTasks)
	.then(completeImageTaskList)
	.then(logImageSizes)
	.then(function() {
		rl.close();
	})
	.catch(function(err) {
		console.log(err);
	});
})
.on('close', function() {
	console.log("Thanks!");
	process.exit(0);
});
function searchUrlAndParseForImages(urlToSearch) {
	var options = {
		uri: urlToSearch.trim(),
	    transform: function (body) {
	        return cheerio.load(body);
	    }
	};
	
	return new Promise(function(resolve, reject) {
		rp(options)
		.then(function($) {
			var domainName = urlToSearch;
			if(_.endsWith(urlToSearch, '/')) {
				var endIndex = urlToSearch.lastIndexOf('/');
				domainName = urlToSearch.slice(0, endIndex);
			}
			var imageData = $('img');
			var images = { 
				imageData: imageData,
				domain: domainName
			}
			resolve(images);
		});
	});
	
}

function logTotalImages(images) {
	return new Promise(function(resolve, reject) {
		var logStream = fs.createWriteStream('img-sizes.txt', {'flags': 'a'});
		logStream.write("Total images: " + images.imageData.length + "\r\n");
		logStream.end(function() {
			resolve(images);
		});
	});
}

function logImagesWithQueryParams(images) {
	console.log("Logging images with query parameters...");
	return new Promise(function(resolve, reject) {
		var logStream = fs.createWriteStream('img-sizes.txt', {'flags': 'a'});
		logStream.write("The following links contain query parameters that may limit their size:\r\n");
		var rawLink = '';

		for (val in images.imageData) {
			if (images.imageData[val].type === 'tag') {
				rawLink = images.imageData[val].attribs.src;
				if(_.includes(rawLink, '?')) {
					console.log(rawLink);
					logStream.write(rawLink + "\r\n");
				}
			}
		}
		logStream.end(function() {
			resolve(images);
		});
	});
}

function evaluateAllImages(images) {
	return new Promise(function(resolve, reject) {
		console.log(images.imageData.length * 2);
		console.log(images.domain);
		var linkArr = [{}];
		var endIndex = 0;
		var rawLink = '';
		var linkNoQueryParams = '';
		var link = '';
		var linkAndDomain = {};
		console.log("Evaluating images...")
		for (val in images.imageData) {
			if (images.imageData[val].type === 'tag' && images.imageData[val].attribs.src) {
				rawLink = images.imageData[val].attribs.src;
				console.log("Evaluating " + rawLink);
				if(_.startsWith(rawLink, '//')) {
					rawLink = 'https:' + rawLink;
					if(_.includes(rawLink, '?')) {
						endIndex = rawLink.indexOf('?');
						linkNoQueryParams = rawLink.slice(0, endIndex);
						console.log("Query parameters chopped right off: ");
						console.log(linkNoQueryParams);
						linkAndDomain = {
							resized: rawLink,
							link: linkNoQueryParams,
							domain: images.domain
						};
						console.log(linkAndDomain);
						linkArr.push(linkAndDomain);
					} else {
						linkAndDomain = {
							link: rawLink,
							domain: images.domain
						}
						linkArr.push(linkAndDomain);
					}
				} else if(!_.startsWith(rawLink, '//')) {
					console.log("Link with added domain: ");
					link = images.domain + rawLink;
					console.log(link);
					linkAndDomain = {
						link: link,
						domain: images.domain
					};
					linkArr.push(linkAndDomain);
				} else {
					console.log("I don't like this image...");
				}
			}
		}
		resolve(linkArr);
	});
}

function collectImageRequestTasks(linkArr) {
	return new Promise(function(resolve, reject) {
		var tasks = [];
		for(val in linkArr) {
			if(linkArr[val].link) {
				var options = {
				    method: 'GET',
				    url: linkArr[val].link,
				}
				console.log("Pushing tasks into place...")
				var promised = new Promise(function(resolve, reject) {
					var imageComposite = {
						domain: linkArr[val].domain,
						link: linkArr[val].link
					};
					if(linkArr[val].resized) {
						imageComposite.resized = linkArr[val].resized;
					}
					size(options, function(err, dimensions, length) {
						console.log(dimensions);
						console.log(imageComposite.link);
							// path: response.socket._httpMessage.path,
							// width: size.width,
							// height: size.height,
						imageComposite.dimensions = dimensions;	
						console.log(options.url);
						resolve(imageComposite);
					});
				});
				tasks.push(promised);
			}
		}
		console.log(tasks.length);
		resolve(tasks);
	});
}

function completeImageTaskList(tasks) {
	return new Promise(function(resolve, reject) {
		Promise.all(tasks)
		.then(function(response) {
			console.log(response.length);
			resolve(response);
		});
	});
}

function logImageSizes(imageObjects) {
	return new Promise(function(resolve, reject) {
		var logStream = fs.createWriteStream('img-sizes.txt', {'flags': 'a'});
		for(val in imageObjects) {
			logStream.write("Link: " + imageObjects[val].link + "\r\n");
			if(imageObjects[val].resized) {
				logStream.write("Image contains possible resizing query parameter: " + imageObjects[val].resized + "\r\n");
			}
			logStream.write("Dimensions: \r\n");
			logStream.write("\tHeight: " + imageObjects[val].dimensions.height + " \r\n");
			logStream.write("\tWidth: " + imageObjects[val].dimensions.width + " \r\n");
			logStream.write("Image Type: " + imageObjects[val].dimensions.type + " \r\n");
			logStream.write("Image Domain: " + imageObjects[val].domain + " \r\n");
			logStream.write("********************\r\n");
		}
		logStream.end(function() {
			resolve("Done");
		});
	});
}