// ## Load dilemmas as JSON
var myDilemmas, 
  jsonReceived = false,
  debug = true,
  numTrials = debug ? 4 : 40,
  myFiveCt = 0,
  digitInterval;


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
  
  digitInterval = function(){};
  var trialsPerBlock = numTrials / 2;
  while (totalTrials < numTrials) {
    var newRand = random(0, numTrials - 1);
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

// Check if in viewport, given by StackOverflow
function elementInViewport(el) {
  var offset = el.offset();
  var top = offset.top;
  var left = offset.left;
  var width = offset.width;
  var height = offset.height;

  while(el.offsetParent) {
    el = el.offsetParent;
    top += el.offsetTop;
    left += el.offsetLeft;
  }
  console.log(el, el.offsetTop, window.pageYOffset);
  return (
    top >= window.pageYOffset &&
    left >= window.pageXOffset &&
    (top + height) <= (window.pageYOffset + window.innerHeight) &&
    (left + width) <= (window.pageXOffset + window.innerWidth)
  );
}

// ## Configuration settings
var myKeyBindings = {"j": "yes", "k": "no", "f": "five"},
    trialOrder = genTrialOrder(numTrials),
    myDilemmas = {},
    trueFiveCt = 0
    userFiveCt = 0,
    width = window.innerWidth;
console.log("trial order after gen", trialOrder);
    
// Show the instructions slide -- this is what we want subjects to see first.
showSlide("instructions-general");

// ## The main event
// I implement the sequence as an object with properties and methods. The benefit of encapsulating everything in an object is that it's conceptually coherent (i.e. the <code>data</code> variable belongs to this particular sequence and not any other) and allows you to **compose** sequences to build more complicated experiments. For instance, if you wanted an experiment with, say, a survey, a reaction time test, and a memory test presented in a number of different orders, you could easily do so by creating three separate sequences and dynamically setting the <code>end()</code> function for each sequence so that it points to the next. **More practically, you should stick everything in an object and submit that whole object so that you don't lose data (e.g. randomization parameters, what condition the subject is in, etc). Don't worry about the fact that some of the object properties are functions -- mmturkey (the Turk submission library) will strip these out.**

var experiment = {
  // Parameters for this sequence.
  trials: trialOrder,
  originalTrials: trialOrder,
  // Experiment-specific parameters - which datkeys map to odd/even
  keyBindings: myKeyBindings,
  dilemmas: myDilemmas,
  // An array to store the data that we're collecting.
  data: [],
  /*genDigitMarquee: function(speedPx) {
    var randDigit = random(0, 9);
    if (randDigit == 5) {
      $("#digit-marquee").html( $("#digit-marquee").html() + "<span class=\"five\">5</span>");
      var fiveElem = $(".five");
      console.log(fiveElem);
      for (elem in fiveElem){
        console.log(elem);
        if (elementInViewport(elem)){
          // element is now visible in the viewport
          trueFiveCt++;
          $(".five").removeClass(".five");
          console.log("removed five class?");
          $("#true-five").html(trueFiveCt);
        } 
        else {
          // element has gone out of viewport
        }
      }
    }
    else {
      $("#digit-marquee").html( $("#digit-marquee").html() + randDigit);
    }
    return;
  },*/
  
  trialInstructions: function(nextTrial) { // called with no arguments randomizes next trial, else set to nextTrial's instructions
    var blockNumber = nextTrial ? 2 : 1;
    var rand = random() % 2;
    console.log("rand", rand);
    // randomly pick trial order if on general instructions screen
    // load block first then non-load
    if((rand == 0 && !nextTrial) || nextTrial == "load"){
      console.log("load block...");
      experiment.loadBlock();
      $("#load-next-btn").click(function() {
        this.blur();
        experiment.next("load", blockNumber);
      })
    }
    // non-load then load
    else {
      console.log("non load block...");
      experiment.nonLoadBlock();
      $("#nonload-next-btn").click(function() {
        this.blur();
        experiment.next("non-load", blockNumber);
      })
    }
    //return experiment.end();
  },
  // Add new random digit to "digit stream"
 genDigitMarquee: function(){
    var randDigit = random(0, 9);
    $("ul").append("<li>" + randDigit + "</li>");
    $("ul").animate({
      left: "-=40px"
    }, { duration: 300, queue: false});
    if (randDigit == 5){
      trueFiveCt++;
      $("#true-five").html(trueFiveCt);
    }
    return;
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
  // The work horse of the sequence - what to do on every trial.
  next: function(blockName, blockNumber){
    console.log("trial type: ", blockName);

    var blockTrials = blockName == "load" ? experiment.trials["loadTrials"] : experiment.trials["nonLoadTrials"];
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
    
    // Compute the correct number of fives, reset counters (for debugging)
    trueFiveCt = 0;
    userFiveCt = 0;
    $("#true-five").html(trueFiveCt);
    $("#user-five").html("user count:" + userFiveCt);
    $("ul").empty();
    $("ul").css("left", width);
    console.log("ul left: " + $("ul").css("left"));
    

    // Display the dilemma name
    console.log("n", n);
    console.log("dilemmas", experiment.dilemmas);
    $.getJSON("dilemmas_no_breaks.json", function(myDilemmas) {
      console.log(myDilemmas);
      jsonReceived = true;
      $("#dilemma-name").html(myDilemmas[n]["Name"]);
      $("#dilemma-text").html(myDilemmas[n]["Text"]);

      showSlide("trial");

      // Display digit marquee only during load bloack
      if (blockName == "load"){       
        console.log("IN load block.. trying to show load-only");
        $(".load-only").show();

        // Set up digit marquee
        trueFiveCt = 0;
        userFiveCt = 0;
        console.log("block trials length: ", blockTrials.length, "num trials: ", numTrials);
        var interval = (blockTrials.length + 1) >= numTrials / 2 ? Math.ceil(300) : Math.ceil(1000/3.5);
        digitInterval = window.setInterval(experiment.genDigitMarquee, interval);
        console.log("interval: ", interval);
      }
    });
    /*
    $("#dilemma-name").html(experiment.dilemmas[n]["Name"]);
      $("#dilemma-text").html(experiment.dilemmas[n]["Text"]);
      */
    
    // Get the current time so we can compute reaction time later.
    var startTime = (new Date()).getTime();
    
    // Set up a function to react to keyboard input. Functions that are used to react to user input are called *event handlers*. In addition to writing these event handlers, you have to *bind* them to particular events (i.e., tell the browser that you actually want the handler to run when the user performs an action). Note that the handler always takes an <code>event</code> argument, which is an object that provides data about the user input (e.g., where they clicked, which button they pressed).
    var keyPressHandler = function(event) {
      // A slight disadvantage of this code is that you have to test for numeric key values; instead of writing code that expresses "*do X if 'Q' was pressed*", you have to do the more complicated "*do X if the key with code 80 was pressed*". A library like [Keymaster][keymaster], or [zen][zen] (my library, and a work in progress) lets you write simpler code like <code>key('a', function(){ alert('you pressed a!') })</code>, but I've omitted it here. Here, we get the numeric key code from the event object
      // [keymaster]: http://github.com/madrobby/keymaster
      // [zen]: http://github.com/longouyang/zenjs
      var keyCode = event.which;
      // add to user's 5 count upon each "f" key click
      if (keyCode == 70) {
        userFiveCt++;
        $("#user-five").html("user count:" + userFiveCt);
      }

      if(keyCode != 74 && keyCode != 75) {
        // If a key that we don't care about is pressed, re-attach the handler (see the end of this script for more info)
        $(document).one("keydown", keyPressHandler);
        
      } 
      else {
        // end digit stream
        clearInterval(digitInterval);

        // map keycode to character on keyboard
        var key = "";
        switch(keyCode){
          case 74: key = "j"; break;
          case 75: key = "k"; break;
          default: $(document).one("keydown", keyPressHandler); break;
        }

        // If a valid key is pressed (code 74 is j, 75 is k, 70 is f),
        // record the reaction time (current time minus start time), which key was pressed, and what that means (even or odd).
        var endTime = (new Date()).getTime(),
            data = {
              stimulus: n,
              highConflict: n < 12 ? "high" : "low",
              response: experiment.keyBindings[key],
              rt: endTime - startTime,
              accuracy: 1 - Math.abs(userFiveCt - trueFiveCt) / trueFiveCt
            };
        
        experiment.data.push(data);
        // Temporarily clear the text.
        $("#dilemma-name").html("");
        $("#dilemma-text").html("");
        // Wait 500 milliseconds before starting the next trial.
        blockName == "load" ? setTimeout(experiment.next("load", blockNumber), 500) : setTimeout(experiment.next("nonLoad", blockNumber), 500);
      }
    };
    
    // Here, we actually bind the handler. We're using jQuery's <code>one()</code> function, which ensures that the handler can only run once. This is very important, because generally you only want the handler to run only once per trial. If you don't bind with <code>one()</code>, the handler might run multiple times per trial, which can be disastrous. For instance, if the user accidentally presses P twice, you'll be recording an extra copy of the data for this trial and (even worse) you will be calling <code>experiment.next</code> twice, which will cause trials to be skipped! That said, there are certainly cases where you do want to run an event handler multiple times per trial. In this case, you want to use the <code>bind()</code> and <code>unbind()</code> functions, but you have to be extra careful about properly unbinding.
    $(document).one("keydown", keyPressHandler);
    
  }
}