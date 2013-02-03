var impersonalArray = new Array();
var personalArray = new Array();
dilemmas();

function dilemmas(){
	$.getJSON("sample.json", function(data) {
    console.log(data);
    // data is a JavaScript object now. Handle it as such

});
}