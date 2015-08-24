var app = require('express')(),
	http = require('http').Server(app),
	io = require('socket.io')(http),
	Backbone = require("backbone"),
	jsonfile = require('jsonfile'),
	util = require('util'),
	_ = require('lodash');

require('console-group').install();








/* -------	START "INCLUDE" FOR slides.js ------- */
	(function () {

		app.LineModel = Backbone.Model.extend({
			defaults: {
				type: "content",
				content: "",
				live: false,
				stage: false,
				modified: false
			},
			initialize: function (params) {
				var self = this;

				Object.defineProperty(self, "is_starter", {
					enumerable: true,
					get: function () {
						return ([
							"title",
							"point",
							"music",
							"countdown"
						]).indexOf(self.get("type")) > -1
					}
				});
			}
		});

		app.LineCollection = Backbone.Collection.extend({
			model: app.LineModel,
			comparator : function(model){
				return model.get("order");
			},
			initialize: function () {

			var self = this;

			/*
			this.on("add", function (model) {
				model.index = function () {
					return self.indexOf(this);
				};
			});
			*/

			self.on("update", function () {
				self.forEach(function (m, i) {
					m.set("order", i);
				});
			});

		}
		});

		app.line_collection = new app.LineCollection();


	})();
/* -------	END "INCLUDE" FOR slides.js ------- */










/*
app.get('/', function(req, res){
  res.sendfile('index.html');
});*/


/*	JSON read/write helpers
------------------------------------------*/

	app.write = function (params) {
		jsonfile.writeFile("data/" + params.path + ".json", params.data, function (err) {
			if (err)
			{
				if (params.error)
					params.error.call(app, err);
			} else {
				if (params.success)
					params.success.call(app);
			}
			if (params.complete)
				params.complete.call(app);
		});
	};


	app.read = function (params) {
		jsonfile.readFile("data/" + params.path + ".json", function (err, obj) {
			if (err)
			{
				if (params.error)
					params.error.call(app, err);
			} else {
				if (params.success)
					params.success.call(app, obj);
			}
			if (params.complete)
				params.complete.call(app, obj);
		});
	};



app.read({
	path: "feeds/2015-08-23",
	success: function (response) {
		app.line_collection.set(response);
	}
});



app.write({
	path: "live",
	data: {
		updated: new Date(),
		author: "Josh"
	},
	complete: function () {
		app.read({
			path: "live",
			success: function (response) {
				console.log('success response: ', response);
			},
			error: function (err) {
				console.log('err: ', err);
			},
			complete: function (response) {
				console.log('complete response: ', response);
			}
		});
	}
});


var Connection = Backbone.Model.extend({
		initialize: function (params) {
			//console.log("A Backbone User is being created!");
			this.socket = null;
		},
		setSocket: function (socket) {
			this.socket = socket;
		}
	}),
	Connections = Backbone.Collection.extend({
		model: Connection
	}),
	connections = new Connections();



io.on('connection', function (socket) {
	console.group('a user connected');

	var connection = connections.add({});
	connection.setSocket(socket);

	console.log("This makes '" + connections.length + "' connections!");

	/*	Socket Callback
	--------------------------------------*/
		var response_handlers = {};

		var qcid = 0,
			question_callbacks = new Backbone.Collection();

		function request (params) {
			qcid++;
			var cb = question_callbacks.add({
					id: qcid,
					success: params.success,
					error: params.error
				});
			socket.emit("request", {
				i: qcid,
				q: params.query,
				d: params.data
			});
		}

		app.request = request;

		socket.on("response", function (response) {
			var cb = question_callbacks.find({id:response.i});
			if (response.e)
				cb.get("error").call(app, response.e);
			else
				cb.get("success").call(app, response.d);

			// clean it up!
			question_callbacks.remove(cb);
		});

		socket.on("request", function (query) {
			var response = {i:query.i};

			//console.log('query: ', query);

			if (response_handlers[query.q])
			{
				var data;
				try {
					data = response_handlers[query.q].call(app, query.d);
				} catch (er) {
					response.e = "response failed";
				}
				response.d = data;
			} else {
				response.e = "no such question found";
			}

			if (response)
			{
				//console.log("responding to question '" + query.q + "', " + JSON.stringify(response.d, null, 4));
				socket.emit("response", response);
			}
		});


	response_handlers.slides = function () {
		return app.line_collection.toJSON();
	};


	app.request({
		query: "mode",
		success: function (response) {
			console.log('mode response: ', response);

			if (response == "presenter")
			{
				socket.emit("update", [
					{
						i: 1,
						d: {
							content: "loading slides&hellip;"
						}
					}
				]);
			}
		}
	});

	socket.on("update", function (datas) {
		console.log("Got an update from socket");
		_.forEach(datas, function (data) {
			var model_to_update = app.line_collection.find(function (model) {
				console.log("checking " + model.get("order") + " matches " + data.i);
				return model.get("order") === data.i;
			});
			model_to_update.set(data.d);
		});
		socket.broadcast.emit("update", datas);
	});

	socket.on("add-slide", function (data) {
		console.log("Got a new slide from socket");
		app.line_collection.add(data);
		socket.broadcast.emit("add-slide", data);
	});

	socket.on("remove-slide", function (index) {
		var model = app.line_collection.find(function (m) {
				return m.get("order") === index;
			});
		socket.broadcast.emit("remove-slide", model.get("order"));
		app.line_collection.remove(model);
	});

	socket.on("save", function () {
		app.write({
			path: "feeds/2015-08-23",
			data: app.line_collection,
			success: function () {
				socket.emit("saved");
			},
			error: function () {
				socket.emit("save-error");
			}
		});
	});

	console.log("enabling disconnect");
	socket.on('disconnect', function () {
		connections.remove(connection);
		console.log('connection disconnected - new count: ' + connections.length);
	});

	console.groupEnd();
});



http.listen(3000, function(){
  console.log('listening on *:3000');
});



//require( 'console-group' ).teardown();

