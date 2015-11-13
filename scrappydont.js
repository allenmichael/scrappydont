var rp = require('request-promise');
var cheerio = require('cheerio');
var fs = require('fs');
var _ = require('lodash');
var http = require('http');
var https = require('https');
var rl = require('readline-sync');
var size = require('request-image-size');

var global_settings = {
	domain: '',
	urlToSearch: '',
	fileName: ''
};

fs.unlink(__dirname + "/img-sizes.txt", function(err) {
	//console.log(err);
});

global_settings.urlToSearch = rl.question("Enter the url to search: ");

global_settings.domain = rl.question("Set the domain? (Press enter if search url is the domain) ");

if(global_settings.domain == '') {
		global_settings.domain = global_settings.urlToSearch;
}

searchUrlAndParseForImages(global_settings)
.then(logTotalImages)
.then(logImagesWithQueryParams)
.then(evaluateAllImages)
.then(collectImageRequestTasks)
.then(completeImageTaskList)
.then(logImageSizes)
.catch(function(err) {
	console.log(err);
});

function searchUrlAndParseForImages(urlToSearch) {
	var options = {
		uri: global_settings.urlToSearch.trim(),
	    transform: function (body) {
	        return cheerio.load(body);
	    }
	};
	
	return new Promise(function(resolve, reject) {
		rp(options)
		.then(function($) {
			var domainName = global_settings.domain;
			if(_.endsWith(domainName, '/')) {
				var endIndex = global_settings.domain.lastIndexOf('/');
				domainName = global_settings.domain.slice(0, endIndex);
			}
			var imageData = $('img');
			var images = { 
				imageData: imageData,
				domain: domainName
			}
			resolve(images);
		})
		.catch(function(e) {
			console.log(e);
			reject(e);
		});
	});
	
}

function logTotalImages(images) {
	return new Promise(function(resolve, reject) {
		var logStream = fs.createWriteStream('img-sizes.txt', {'flags': 'a'});
		logStream.write("Searched URL: " + global_settings.urlToSearch + "\r\n");
		logStream.write("Total images: " + images.imageData.length + "\r\n");
		logStream.on('error', function(e) {
			console.log(e);
			reject(e);
		});
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

		logStream.on('error', function(e) {
			console.log(e);
			reject(e);
		});

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
				if(_.startsWith(rawLink, 'http') || _.startsWith(rawLink, 'https')) {
					linkAndDomain = {
							link: rawLink,
							domain: images.domain
					}
					linkArr.push(linkAndDomain);
				} else if(_.startsWith(rawLink, '//cdn')) {
					fullLink = 'https:' + rawLink;
					if(_.includes(fullLink, '?')) {
						endIndex = fullLink.indexOf('?');
						linkNoQueryParams = fullLink.slice(0, endIndex);
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
							link: fullLink,
							domain: images.domain
						}
						linkArr.push(linkAndDomain);
					}
				} else if(_.startsWith(rawLink, '..')) {
					var regex = new RegExp('[a-zA-Z]');
					var result = rawLink.match(regex);
					var slicedLink = rawLink.slice(result.index, rawLink.length);
					link = images.domain + '/' + slicedLink;
					console.log(link);
					linkAndDomain = {
						relativeLink: rawLink,
						link: link,
						domain: images.domain
					};
					linkArr.push(linkAndDomain);
				} else if(_.startsWith(rawLink, '//')) {
					fullLink = 'https:' + rawLink;
					linkAndDomain = {
							link: fullLink,
							domain: images.domain
					}
					linkArr.push(linkAndDomain);
				} else if(!_.startsWith(rawLink, 'http') || !_.startsWith(rawLink, 'https')) {
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
		console.log(linkArr);
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
				console.log("Tasks falling into place...")
				var promised = new Promise(function(resolve, reject) {
					
					var imageComposite = {
						domain: linkArr[val].domain,
						link: linkArr[val].link
					};
					if(linkArr[val].resized) {
						imageComposite.resized = linkArr[val].resized;
					}
					if(linkArr[val].relativeLink) {
						imageComposite.relativeLink = linkArr[val].relativeLink;
					}
					size(options, function(err, dimensions, length) {
						if(err || dimensions == undefined) {
							console.log(err);
							imageComposite.error = err;
							resolve(imageComposite);
						} else{
							console.log(dimensions);
							console.log(imageComposite.link);
								// path: response.socket._httpMessage.path,
								// width: size.width,
								// height: size.height,
							imageComposite.dimensions = dimensions;	
							console.log(options.url);
							resolve(imageComposite);
						}
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
				logStream.write("Image contains possible resizing query parameter:\r\n");
				logStream.write(imageObjects[val].resized + "\r\n");
			}

			if(imageObjects[val].relativeLink) {
				logStream.write("Consider removing relative links from <img> tags: \r\n");
				logStream.write(imageObjects[val].relativeLink + "\r\n");
			}

			if(imageObjects[val].dimensions) {
				logStream.write("Dimensions: \r\n");
				logStream.write("\tHeight: " + imageObjects[val].dimensions.height + " \r\n");
				logStream.write("\tWidth: " + imageObjects[val].dimensions.width + " \r\n");
				logStream.write("Image Type: " + imageObjects[val].dimensions.type + " \r\n");
				logStream.write("********************\r\n");
			}

			if(imageObjects[val].error) {
				logStream.write("Error: \r\n");
				logStream.write(imageObjects[val].error + "\r\n");
				logStream.write("********************\r\n");
			}
		}
		
		logStream.on('error', function(err) {
			console.log(err);
			reject(err);
		});

		logStream.end(function() {
			resolve("Done");
		});
	});
}