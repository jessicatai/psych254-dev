// Check for "PREVIEW" mode (disable start button if in preview mode)
if (turk.assignmentId == "ASSIGNMENT_ID_NOT_AVAILABLE"){
  console.log("in preview");
  $("button").attr("disabled", "disabled");
  $("button").html("Click ACCEPT HIT button above to start");
}
else {
  console.log("not in preview");
}

// ## Load dilemmas as JSON
var myDilemmas, 
  jsonReceived = false,
  debug = false,
  numTrials = debug ? 2 : 40,
  breakInterval = debug ? 1: 5,
  myFiveCt = 0,
  keyPresses = 0,
  digitInterval;

// add onclick toggle event for microphone button
/*$(".mic").click(function(){
  if ($(".mic").html() == "START recording"){
    $(".mic").html("STOP recording");
    $(".mic").css("background-color", "#eaa4a4");
  }
  else{
    $(".mic").html("START recording");
    $(".mic").css("background-color", "#b2cc88");
  }
});*/

// ## High-level overview
// Things happen in this order:
// 
// 1. Compute randomization parameters (which keys to press for even/odd and trial order), fill in the template <code>{{}}</code> slots that indicate which keys to press for even/odd, and show the instructions slide.
// 2. Set up the experiment sequence object.
// 3. When the subject clicks the start button, it calls <code>experiment.next()</code>
// 4. <code>experiment.next()</code> checks if there are any trials left to do. If there aren't, it calls <code>experiment.end()</code>, which shows the finish slide, waits for 1.5 seconds, and then uses mmturkey to submit to Turk.
// 5. If there are more trials left, <code>experiment.next()</code> shows the next trial, records the current time for computing reaction time, and sets up a listener for a key press.
// 6. The key press listener, when it detects either a P or a Q, constructs a data object, which includes the presented stimulus number, RT (current time - start time), and whether or not the subject was correct. This entire object gets pushed into the <code>experiment.data</code> array. Then we show a blank screen and wait 500 milliseconds before calling <code>experiment.next()</code> again.

// ## Helper functions

// Shows slides. We're using jQuery here - the **$** is the jQuery selector function, which takes as input either a DOM element or a CSS selector string.
function showSlide(id) {
  // Hide all slides
  $(".slide").hide();
  $(".load-only").hide();
  // Show just the slide we want to show
  $("#"+id).show();
  $(window).unbind("focus");
  $(window).unbind("blur");
}

// Get random integers.
// When called with no arguments, it returns either 0 or 1. When called with one argument, *a*, it returns a number in {*0, 1, ..., a-1*}. When called with two arguments, *a* and *b*, returns a random value in {*a*, *a + 1*, ... , *b*}.
function random(a,b) {
  if (typeof b == "undefined") {
    a = a || 2;
    return Math.floor(Math.random()*a);
  } else {
    return Math.floor(Math.random()*(b-a+1)) + a;
  }
}

// Add a random selection function to all arrays (e.g., <code>[4,8,7].random()</code> could return 4, 8, or 7). This is useful for condition randomization.
Array.prototype.random = function() {
  return this[random(this.length)];
}

// Generates a pseudorandom trial order for both the load and non-load blocks
// first 12 trials (index 0 to 11) are high-conflict personal dilemma
// index 12 to 19 are low-conflict personal dilemma
// index 20 to 39 are impersonal dilemma
function genTrialOrder(numTrials) {
  var allTrials = new Array(numTrials),
    loadTrials = new Array(),
    nonLoadTrials = new Array(),
    loadHighCt = 0,
    nonLoadHighCt = 0,
    totalTrials = 0;
  
  // Default function to be able to clear interval upon j or k key press
  digitInterval = function(){};

  var trialsPerBlock = numTrials / 2;
  while (totalTrials < numTrials) {
    var newRand = random(0, 39);
    // add to load trials
    if (random() == 0 && loadTrials.length < trialsPerBlock) {
      // continue to generate a random number until an unassigned trial number is picked
      // also ensure no more than 7 high personal conflict trials assigned into load block
      while(allTrials[newRand] || (newRand < 12 && loadHighCt >= 7)) {
        newRand = random(0, numTrials - 1);
      }
      if (newRand < 12) {
        loadHighCt++;
      }
      loadTrials.push(newRand); // add new trial to load block
      totalTrials++;
      allTrials[newRand] = true;
    }

    else if(nonLoadTrials.length < trialsPerBlock) {
      // continue to generate a random number until an unassigned trial number is picked
      // also ensure no more than 7 high personal conflict trials assigned into non-load block
      while(allTrials[newRand] || (newRand < 12 && nonLoadHighCt >= 7)) {
        newRand = random(0, numTrials - 1);
      }
      if (newRand < 12) {
        nonLoadHighCt++;
      }
      nonLoadTrials.push(newRand); // add new trial to non-load block
      totalTrials++;
      allTrials[newRand] = true;
    }
    
  }
  return {
    'loadTrials' : loadTrials,
    'nonLoadTrials' : nonLoadTrials
  };

}

function clone(obj){
  // Handle the 3 simple types, and null or undefined
  if (null == obj || "object" != typeof obj) return obj;
  // Handle Date
  if (obj instanceof Date) {
      var copy = new Date();
      copy.setTime(obj.getTime());
      return copy;
  }

  // Handle Array
  if (obj instanceof Array) {
      var copy = [];
      for (var i = 0, len = obj.length; i < len; i++) {
          copy[i] = clone(obj[i]);
      }
      return copy;
  }

  // Handle Object
  if (obj instanceof Object) {
      var copy = {};
      for (var attr in obj) {
          if (obj.hasOwnProperty(attr)) copy[attr] = clone(obj[attr]);
      }
      return copy;
  }

  throw new Error("Unable to copy obj! Its type isn't supported.");
}


// ## Configuration settings
var myKeyBindings = {"j": "yes", "k": "no", "f": "five"},
    trialOrder = genTrialOrder(numTrials),
    trueFiveCt = 0,
    userFiveCt = 0,
    width = $(window).width(),
    isBreak = false;//window.innerWidth;
    
// Show the instructions slide -- this is what we want subjects to see first.
showSlide("instructions-general");

// ## The main event
// I implement the sequence as an object with properties and methods. The benefit of encapsulating everything in an object is that it's conceptually coherent (i.e. the <code>data</code> variable belongs to this particular sequence and not any other) and allows you to **compose** sequences to build more complicated experiments. For instance, if you wanted an experiment with, say, a survey, a reaction time test, and a memory test presented in a number of different orders, you could easily do so by creating three separate sequences and dynamically setting the <code>end()</code> function for each sequence so that it points to the next. **More practically, you should stick everything in an object and submit that whole object so that you don't lose data (e.g. randomization parameters, what condition the subject is in, etc). Don't worry about the fact that some of the object properties are functions -- mmturkey (the Turk submission library) will strip these out.**

var experiment = {
  // Parameters for this sequence.
  trials: trialOrder,
  blockOrder: "NOT SET",
  originalTrials: clone(trialOrder),
  // Experiment-specific parameters - which datkeys map to odd/even
  keyBindings: myKeyBindings,
  // An array to store the data that we're collecting.
  data: [],    
  trialInstructions: function(nextTrial) { // called with no arguments randomizes next trial, else set to nextTrial's instructions
    var blockNumber = nextTrial ? 2 : 1;
    var rand = random() % 2;
    console.log("rand", rand);
    // randomly pick trial order if on general instructions screen
    // load block first then non-load
    if((rand == 0 && !nextTrial) || nextTrial == "load"){
      console.log("load block...");
      experiment.blockOrder = "non-load, load"; // load as 2nd trial will set this variable last before pushed to data
      experiment.loadBlock();
      $("#load-next-btn").click(function() {
        this.blur();
        experiment.next("load", blockNumber);
      })
    }
    // non-load then load
    else {
      console.log("non load block...");
      experiment.blockOrder = "load, non-load";
      experiment.nonLoadBlock();
      $("#nonload-next-btn").click(function() {
        this.blur();
        experiment.next("non-load", blockNumber);
      })
    }
  },
  // Add new random digit to "digit stream"
 genDigitMarquee: function(interval){
    var randDigit = random(0, 9);
    $("#digits").animate({
      width: "+=40px"
    }, interval, "linear", function(){
      // when done with animation
      $("#digits").append("<li>" + randDigit + "</li>");
      if (randDigit == 5){
      trueFiveCt++;
      $("#true-five").html(trueFiveCt);
      return;
      }
    });
    
  },
  textMarquee: function(delta, numChars){
    var speed = 1000 * numChars / 6.5;
    var time;
    var start = (new Date()).getTime();
    $(".marquee").animate({
      right: "+=" + delta + "px"
    }, speed, "linear", function(){
      time = (new Date()).getTime() - start; 
      console.log("IN TEXT MARQUEE", time);
    });
    
    return time;
  },
  // Show the instructions for the load block trials
  loadBlock: function(){
    showSlide("instructions-load");
  },
  // Show the instructions for the NON load block trials
  nonLoadBlock: function(){
    showSlide("instructions-non-load");
  },
  // The function that gets called when the sequence is finished.
  end: function() {
    // Show the finish slide.
    showSlide("finished");
    // Wait 1.5 seconds and then submit the whole experiment object to Mechanical Turk (mmturkey filters out the functions so we know we're just submitting properties [i.e. data])
    setTimeout(function() { turk.submit(experiment) }, 1500);
  },
  break: function(blockName, blockNumber) {
    console.log("in break function");
    showSlide("break");
    var blockTrials = blockName == "load" ? experiment.trials["loadTrials"] : experiment.trials["nonLoadTrials"];
    var progress = numTrials - experiment.trials["loadTrials"].length - experiment.trials["nonLoadTrials"].length;
    $("#break-progress").html("You have completed " + progress + " out of " + numTrials + " trials.");

    // attempt to fix bug of text prematurely scrolling
    isBreak = true;
    clearInterval(digitInterval);
    $("#digits").remove();
    $(".marquee").remove();

    $("#continue").unbind("click");
    $("#continue").click(function() {
        this.blur();
        experiment.next(blockName, blockNumber, true);
        //return;
      });
  },
  // The work horse of the sequence - what to do on every trial.
  next: function(blockName, blockNumber, hasBreak){
    var blockTrials = blockName == "load" ? experiment.trials["loadTrials"] : experiment.trials["nonLoadTrials"];

    console.log("trial type: ", blockName, "block trials length", blockTrials.length);
    if (!hasBreak && blockTrials.length < numTrials / 2 && blockTrials.length > 0 
      && (blockTrials.length) % breakInterval == 0){
      // time for an optional break
      return experiment.break(blockName, blockNumber);
    }

    if (hasBreak){
        isBreak = false;
    }

    if (!isBreak){
      // Get the current trial - <code>shift()</code> removes the first element of the array and returns it.
      var n = blockTrials.shift();
      // If the current trial is undefined, it means the trials array was empty, which means that we're done, so call the end function.
      if (typeof n == "undefined") {
        if (blockNumber == 1){
          return blockName == "load" ? experiment.trialInstructions("nonLoad") : experiment.trialInstructions("load");
        }
        else {
          if (experiment.trials["loadTrials"].length > 0 || experiment.trials["nonLoadTrials"].length > 0)
            console.log("error: terminating experiment prematurely");
          return experiment.end();
        }
      }
    
      // create fresh marquee elements
      $("#digits").remove();
      $(".marquee").remove();
      $("#trial").append("<p class=\"marquee\" id=\"dilemma-text\">{{}}</p>");
      $("#trial").append("<ul id=\"digits\"></ul");
      $("#digits").css("right", 0);

      var progress = numTrials - experiment.trials["loadTrials"].length - experiment.trials["nonLoadTrials"].length - 1;
      var barWidth = $("#progressbar").css("width").substring(0, $("#progressbar").css("width").length - 2);
      $("#progress-text").html(progress + " out of " + numTrials + " trials completed");
      $("#progress-inner").css("width", progress / numTrials * barWidth);
      // Compute the correct number of fives, reset counters (for debugging)
      trueFiveCt = 0;
      userFiveCt = 0;
      $("#true-five").html(trueFiveCt);
      $("#user-five").html("user count:" + userFiveCt);
      $("ul").empty();
      

      showSlide("trial");

      // Get the current time so we can compute reaction time later.
      var startTime = (new Date()).getTime();

       // Display digit marquee only during load bloack
      

      $(window).unbind("focus");
      $(window).unbind("blur");
      var counter_ms = 0;
      var pauseStart;
      trueFiveCt = 0;
      userFiveCt = 0;
      var interval = blockTrials.length >= numTrials / 4 ? Math.ceil(1000 / 3.5) : Math.ceil(1000/7);

      $(window).focus(function() {
          //$(".marquee").resume();
          experiment.textMarquee(delta, numChars);
          $("#digits").resume();

          if (blockName == "load") {       
            $(".load-only").show();

            // Set up digit marquee
            digitInterval = window.setInterval(function(){ experiment.genDigitMarquee(interval)}, interval);
          }

          var idleTime = (new Date()).getTime() - pauseStart;
          counter_ms += idleTime;
          console.log("idle time: ", idleTime);
          
      })
          .blur(function() {
            pauseStart = (new Date()).getTime();
            $(".marquee").stop();//pause();
            $("#digits").pause();
            console.log("should be pausing...");
            clearInterval(digitInterval);
            // myInterval  = setInterval(function () {
            //   ++counter_ms;
            // }, 1);
      });

      keyPresses = 0;

      // Display the dilemma name
      console.log("n", n);
      myDilemmas = dilemmas_json;
      jsonReceived = true;
      $("#dilemma-name").html(myDilemmas[n]["Name"]);
      $("#dilemma-text").html(myDilemmas[n]["Text"]);



      var textWidth =  $(".marquee").outerWidth();
      $(".marquee").css("right", "-" + textWidth + "px");
      var numChars = $(".marquee").html().length;
      var delta = textWidth + width; 

      var startRt = (textWidth * numChars * 1000) / (6.5 * delta);
      var startRtNew = experiment.textMarquee(delta, numChars);
      console.log("startRTs", startRt, startRtNew);

     
      if (blockName == "load") {       
        $(".load-only").show();

        // Set up digit marquee
        var interval = blockTrials.length >= numTrials / 4 ? Math.ceil(1000 / 3.5) : Math.ceil(1000/7);
        digitInterval = window.setInterval(function(){ experiment.genDigitMarquee(interval)}, interval);
      }

      
      
      // Set up a function to react to keyboard input. Functions that are used to react to user input are called *event handlers*. In addition to writing these event handlers, you have to *bind* them to particular events (i.e., tell the browser that you actually want the handler to run when the user performs an action). Note that the handler always takes an <code>event</code> argument, which is an object that provides data about the user input (e.g., where they clicked, which button they pressed).
      var keyPressHandler = function(event) {
        var keyCode = event.which;
        // add to user's 5 count upon each "f" key click
        if (keyCode == 70 && blockName == "load") {
          userFiveCt++;
          $("#user-five").html("user count:" + userFiveCt);
          $(document).one("keydown", keyPressHandler);
        }
        // ignore any key pressed before the full sentence has appeared on the screen
        else if((keyCode != 74 && keyCode != 75)
          || ( ((new Date()).getTime()) - startTime - Math.floor(startRt) < 0)) {
          // If a key that we don't care about is pressed, re-attach the handler (see the end of this script for more info)
          $(document).one("keydown", keyPressHandler);
          keyPresses++;
        } 
        else {
          // end  and reset digit stream
          clearInterval(digitInterval);
          $("#digits").remove();
          $(".marquee").remove();
          $("#trial").append("<p class=\"marquee\" id=\"dilemma-text\">{{}}</p>");
          $("#trial").append("<ul id=\"digits\"></ul");
          $("#digits").css("right", 0);
          console.log("appended new ul");

          // map keycode to character on keyboard
          var key = "";
          switch(keyCode){
            case 74: key = "j"; break;
            case 75: key = "k"; break;
            default: $(document).one("keydown", keyPressHandler); break;
          }

          //var ratio = userFiveCt / trueFiveCt; // if ratio > 1 then user clicked more times than there were fives
          //var overcounting = Math.max(0, 1 - ((userFiveCt - trueFiveCt) / trueFiveCt)); // overcounting is also penalized
          var ratio = Math.max(0, 1 - (Math.abs(userFiveCt - trueFiveCt) / trueFiveCt));
          console.log("ratio", ratio);
          ratio = isNaN(ratio) ? 0 : ratio;

          // Determine type of dilemma based on index number
          var category = "";
          if (n < 12){
            category = "util";
          }
          else {
            category = "non-util"
          }
          console.log("counter ms", counter_ms);
          // If a valid key is pressed (code 74 is j, 75 is k, 70 is f),
          // record the reaction time (current time minus start time), and digit count accuracy metrics
          var endTime = (new Date()).getTime(),
              data = {
                block: blockName,
                stimulus: n,
                dilemmaType: category,
                response: experiment.keyBindings[key],
                rawRT: endTime - startTime,
                relativeRT: endTime - startTime - Math.floor(startRt),
                activeRT: endTime - startTime - counter_ms - Math.floor(startRt),
                accuracy: ratio,
                rawAccuracy: trueFiveCt == 0 ? 0 : userFiveCt / trueFiveCt,
                trueFiveTotal: trueFiveCt,
                userFiveTotal: userFiveCt,
                prematureKeyPresses: keyPresses
              };
          
          experiment.data.push(data);
          // Temporarily clear the text.
          $("#dilemma-name").html("");
          $("#dilemma-text").html("");
          // Wait 500 milliseconds before starting the next trial.
          console.log("starting next trial... after pushed key: ", experiment.keyBindings[key]);
          blockName == "load" ? setTimeout(experiment.next("load", blockNumber), 500) : setTimeout(experiment.next("non-load", blockNumber), 500);
        }
      };
      
      // Here, we actually bind the handler. We're using jQuery's <code>one()</code> function, which ensures that the handler can only run once. This is very important, because generally you only want the handler to run only once per trial. If you don't bind with <code>one()</code>, the handler might run multiple times per trial, which can be disastrous. For instance, if the user accidentally presses P twice, you'll be recording an extra copy of the data for this trial and (even worse) you will be calling <code>experiment.next</code> twice, which will cause trials to be skipped! That said, there are certainly cases where you do want to run an event handler multiple times per trial. In this case, you want to use the <code>bind()</code> and <code>unbind()</code> functions, but you have to be extra careful about properly unbinding.
      $(document).one("keydown", keyPressHandler);
    }
  }
}