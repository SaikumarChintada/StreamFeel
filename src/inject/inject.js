/* Copyright (c) 2017 Adam Browne
 * Inject.js is the content script which analyzes twitch. */
//Chart visualization code is in another file due to it's "spammy" nature w/ dynamically created HTML elements and styles.

 chrome.runtime.onMessage.addListener(function(response) {
    if (response == "tf")
        toggleFilter();
    else if(response == "ss")
        showChart();
});

var port = chrome.runtime.connect({name: "handler"});

port.onMessage.addListener(function(message) {
	MessageHandler(message);
});

function MessageHandler(message){
    var data = message.split("|"), user;
    var target_msg = document.getElementById(data[0]);
    try {
        user = data[2].toLowerCase();
    } catch (err) {}
    if(toggle_filter == false) {
	    try {
            if(data[4] == "1" || user == current_user)
                target_msg.setAttribute("style", "display:block;visibility:visible;");
            else
                target_msg.remove();
	    } catch (err) {}
        storeAnalyticsData(data);		    
    } else {
        target_msg.setAttribute("style", "display:block;visibility:visible;");		
        storeAnalyticsData(data);
        data[5] = "";
        need.push(data.join('|'));
    }
}

function enqueueEmote(label, time) {
    if (!(time in analData == true)) {
        if (!(time in qd_emotes) == true) {
            qd_emotes[time] = [];
            qd_emotes[time].push("." + label);
        } else
            qd_emotes[time].push("." + label);
    } else 
        analData[time].storeRecord("." + label);
}

function parseEmotes(message, time) {
    var emotes = message.getElementsByTagName("img");
    for (var i = 0; i < emotes.length; ++i) {
        var current_emote = emotes[i];
        var textRep = current_emote.getAttribute("alt");
        if (!(textRep in emote_map) == true)
            emote_map[textRep] = current_emote.getAttribute("src");
        enqueueEmote(textRep, time);
    }
}

function StreamData() {
    this.freq = {}, this.sent = [];
    this.cmd = [], this.emote = [];

    this.storeRecord = function(label) {
        if (!(label in this.freq) == true)
            this.freq[label] = 1;
        else
            ++this.freq[label];
    }

    this.isSentType = function(key, parameter) {
        return parameter == "" && key[0] != "!" && key[0] != ".";
    }

    this.desiredKeys = function(type) {
        var parameter = type == "cmd" ? "!" :
            type == "e" ? "." : "";
        var output = [];
        for (var key in this.freq) {
			if (parameter == key[0])
				output.push(key);
			else if (this.isSentType(key, parameter) == true)
				output.push(key);
        }
        return output;
    }

    this.getTypeTotal = function(type_keys) {
        var total = 1;
		for (var key in type_keys)
			if (this.freq.hasOwnProperty(key)) 
				total += this.freq[key];
		return total;
    }

    this.updateDataFreq = function(type) {
        var type_keys = this.desiredKeys(type),
            totalFreq = this.getTypeTotal(type_keys);
        type == "cmd" ? this.cmd = [] : type == "e" ? this.emote = [] : this.sent = [];
        for (var key in type_keys) {
            var actual = type_keys[key];
            if (this.freq.hasOwnProperty(actual)) {
                var val = this.freq[actual];
                if (type == "cmd")
                    this.cmd.push({
                        label: actual,
                        value: (val / totalFreq)
                    });
                else if (type == "e") {
                    //complete emoji image labels
                } else {
                    this.sent.push({
                        label: actual,
                        value: (val / totalFreq)
                    });
                }
            }
        }
    }
}

function storeAnalyticsData(data) {
    var cur_time = data[1], record;
    if (!(cur_time in analData) == true) {
        analData[cur_time] = new StreamData();
        if (!(cur_time in qd_emotes) == false && qd_emotes[cur_time].length > 0) {
            while (qd_emotes[cur_time].length > 0) {
                var emote = qd_emotes[cur_time].shift();
                analData[cur_time].storeRecord(emote);
            }
            analData[cur_time].updateDataFreq("e");
        }
    }
    if (data[5] != "") { //sentiment analytics
        record = data[5];
        analData[cur_time].storeRecord(record);
        analData[cur_time].updateDataFreq(" ");
    } else { //command analytics
        record = data[6];
		if(record[0] == "!"){
	        analData[cur_time].storeRecord(record);
	        analData[cur_time].updateDataFreq("cmd");
	    }
    }
    if (curTimestamp != cur_time)
		curTimestamp = cur_time;
    var lbls = [], dta = [];
    var curData = (setting == 0? analData[curTimestamp].sent: setting == 1? analData[curTimestamp].cmd:
        analData[curTimestamp].emote);
    for(var index in curData){
        lbls.push(curData[index].label);
        dta.push(curData[index].value);
    }
    pie.data.labels = lbls;
    pie.data.datasets[0].data = dta;    
    // handleLegend(pie);
    pie.update();
    // document.getElementById("0-legend").innerHTML = pie.generateLegend();    
}

var handleLegend = function(chart) {
    chart.options.legendCallback = function(chart){
        var text = [];
        text.push('<ul class="legend">');
        for (var i=0; i<chart.data.datasets[0].data.length; i++) {
            text.push('<li>');
            text.push('<span style="background-color:' + chart.data.datasets[0].backgroundColor[i] + '">' + chart.data.datasets[0].data[i] + '</span>');
            if (chart.data.labels[i]) {
                text.push('<img src="https://static-cdn.jtvnw.net/emoticons/v1/2/1.0">');
                // +chart.data.labels[i]
            }
            text.push('</li>');
        }
        text.push('</ul>');
        return text.join("");
    };
}

var handleTwitchMsg = function(msg) {
    var go_on = false;
    try {
        var timestamp = msg.querySelector("span.timestamp").textContent
        var user = msg.querySelector("span.from").textContent
        var message = msg.querySelector("span.message")
        parseEmotes(message, timestamp);
        go_on = true;
    } catch(err) {
        go_on = false;
    }
    if(go_on == true) {
        if (message.hasAttribute("data-raw") == true) { //better twitch tv
            try {
                var raw_msg = decodeURIComponent(message.getAttribute("data-raw"));
                message = raw_msg.trim();
            } catch (err) {
                message = message.textContent.trim();
            }
        } else {
            message = message.textContent.trim();
        }
        port.postMessage({
            id: msg.id,
            time: timestamp,
            usr: user,
            curusr: current_user,
            data: message
        });
    }
}

var getChatBoxElement = function(main) {
    if (document.querySelector(main) != null) {
        setupMessageListener(document.querySelector(main));
        var sentChart = setupDataViz();
        if (sentChart != null) {
            setupChart(sentChart);
        }
        getCurUser();
    } else {
        setTimeout(function() {
            getChatBoxElement(main);
        }, 500);
    }
}

var setupMessageListener = function(chat_box) {
    var observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            for (var i = 0; i < mutation.addedNodes.length; ++i) {
                var newTwitchMsg = mutation.addedNodes[i], identifier;
                var isValid = true;
                if (newTwitchMsg.id != "undefined" && newTwitchMsg.id != "") { //native twitch
                    identifier = newTwitchMsg.id;
                } else {
                    identifier = newTwitchMsg.getAttribute("data-id"); //better twitch tv
                    if (identifier == "undefined") { //an admin message.
                        newTwitchMsg.setAttribute("style", "display:block;visibility:visible;");
                    }
                    isValid = false;
                }
                if (handled.includes(identifier) == false) {
                    handled.push(identifier);
                    if (isValid == false) //better twitch tv compatibility
                        newTwitchMsg.setAttribute("id", identifier);
                    handleTwitchMsg(newTwitchMsg);
                }
            }
        })
    });
    //listen for new chat messages. We've incorporated BTTV compatibility.
    observer.observe(chat_box, {
        childList: true
    });
}

//if we're turning the filter back on, process all queued messages.
function toggleFilter() {
    toggle_filter = toggle_filter == false ? true : false;
    if (toggle_filter == false) {
        while (need.length > 0) {
            try {
                MessageHandler(need.shift());
            } catch (err) {}
        }
    }
}

function showChart() {
    toggle_chart = toggle_chart == false? true: false;
    var frame = document.getElementById("dataviz");    
    if(toggle_chart == true){
        frame.style.visibility = "hidden";
    } else {
        frame.style.visibility = "visible";
    }
}

function setupChart(construct) {
    pie = new Chart(construct, chartSettings());
}

function checkChangedStream(curStream) {
    if (curStream != oldStream) {
        oldStream = curStream;
        getChatBoxElement("ul.chat-lines");
    }
    oldStream = window.location.href;
    setTimeout(function() {
        checkChangedStream(window.location.href);
    }, 2000);
}
checkChangedStream();