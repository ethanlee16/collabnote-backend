var express = require('express');
var multer = require('multer');
var storage = multer.diskStorage({
	destination: function(req, file, mu) {
		mu(null, './public/files/');
	},
	filename: function(req, file, mu) {
		mu(null, Date.now() + file.originalname.replace(/\s+/g, '').toLowerCase());
	}
});
var upload = multer({storage: storage});

var fs = require('fs');
var crypto = require('crypto');

var API_VER = '1.0';
var app = express();

app.use(express.static(__dirname + '/public'));

app.post('/api/' + API_VER + '/upload', upload.single('file'), function(req, res) {
	console.log(req.file);
	var hash = checksum(req.file.path, function(digest) {
		res.send("We got your file, with hash " + digest);
	});
	
});

function checksum(filepath, callback) {
	var hash = crypto.createHash('md5');
	var stream = fs.createReadStream(filepath);

	stream.on('data', function(data) {
		hash.update(data, 'utf8');
	});
	var digest = "";
	stream.on('end', function () {
		digest += hash.digest('hex');
		console.log("Digested hash: " + digest);
		callback(digest);
	});
}

app.listen(3000);