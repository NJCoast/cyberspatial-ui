/**
 * @author Chris Sweet <csweet1@nd.edu>
 *
 * @description Runs simulations on James' backend with expert choice of input parameters.
 *
 */

//unique id for this simulation
var sim_id = 0;

//counter for sim seconds
var seconds_running = 0;

//heatmap data
var addressPoints = null;

//heatmap layer
var heatmap = null;

//function to start simulation, POSTs input data to the server
function start_expert_simulation(){

    //load Latitude
    var latitude = parseFloat(document.getElementById("latitude").value);
    var longitude = parseFloat(document.getElementById("longitude").value);

    //test
    if (isNaN(latitude) || isNaN(longitude)) {
        alert("Please enter correct value for Latitude/Longitude.");
        return;
    }

    //load Angle
    var angle = parseFloat(document.getElementById("angle").value);

    //load time to landfall
    var input_ttl = parseFloat(document.getElementById("input_ttl").value);

    //load pressure
    var input_cp = parseFloat(document.getElementById("input_cp").value);

    //load speed
    var input_vf = parseFloat(document.getElementById("input_vf").value);

    //load radius
    var input_rm = parseFloat(document.getElementById("input_rm").value);

    //load SLR
    var input_slr = parseFloat(document.getElementById("input_slr").value);

    console.log("start sim with lat " + latitude.toString() + "long " + longitude.toString());

    //disable button
    document.getElementById("calculate").classList.add("disabled");
    document.getElementById("spinner").style.display = "block";

    //create unique id to tag socket comms
    sim_id = Math.random().toString(36).substr(2, 9);

    data = {
      "index_SLT": [1,1],
      "index_W": 0,
      "index_prob": 1,
      "indicator": 1,
      "param": [latitude, longitude, angle, input_cp, input_vf, input_rm],
      "timeMC": input_ttl,
      "lat_track": 41.000493,
      "long_track": -72.610756,
      "SLR": input_slr,
      "tide": 0,
      "runup_file": "heatmap.json",
      "workspace_file": ""
  };

  console.log(JSON.stringify(data));

  //do Ajax
  send_expert_data_to_server(data);

}

//function to start simulation, POSTs input data to the server. Actual AJAX call
function send_expert_data_to_server(data) {
    $.ajax({
        type: "POST",
        url: "http://127.0.0.1:9090/single?name=" + owner.toString() + "&id=" + sim_id,
        data: JSON.stringify(data),
        //dataType: "json",
        contentType: 'application/json',
        success: function (result) {
            console.log("EXPERT SIMULATION -- SUCCESS!", result);
            $.notify( "Calculation running", "success");

            //start checking
            setTimeout(get_expert_data_to_server, 1000);
            seconds_running = 0;
        },
        error: function (result) {
            console.log("EXPERT SIMULATION -- ERROR:", result)
            $.notify("Error running calculation!", "error");

            //re-enable if error
            document.getElementById("calculate").classList.remove("disabled");
            document.getElementById("spinner").style.display = "none";
        }
    });
}

//function to check status of simulation, GETs status (AJAX)
function get_expert_data_to_server() {
    $.ajax({
        type: "GET",
        url: "http://127.0.0.1:9090/status?name=" + owner.toString() + "&id=" + sim_id,
        //data: data,
        dataType: "json",
        //contentType: 'application/json',
        success: function (result) {
            console.log("EXPERT SIMULATION -- SUCCESS.", result);
            //$.notify( result.annotations + " annotations saved", "success");
            //data = JSON.parse(result);
            if(result.complete == false){
                console.log("Complete FALSE, time "+seconds_running+" seconds.");

                //re-run if still waiting
                setTimeout(get_expert_data_to_server, 1000);
                seconds_running += 1;

            }else if(result.complete == true){
                console.log("Complete TRUE, time "+seconds_running+" seconds.");

                //re-enable if complete
                document.getElementById("calculate").classList.remove("disabled");
                document.getElementById("spinner").style.display = "none";
                $.notify( "Calculation complete!", "success");

                //load data via Ajax
                load_expert_data_to_server();
            }
        },
        error: function (result) {
            console.log("EXPERT SIMULATION -- ERROR:", result)
            $.notify("Error running calculation.", "error");

            //re-enable if error
            document.getElementById("calculate").classList.remove("disabled");
            document.getElementById("spinner").style.display = "none";
        }
    });
}

//AJAX function to get heatmap from S3 bucket, example:
//https://s3.amazonaws.com/simulation.njcoast.us/simulation/chris/123/heatmap.json
function load_expert_data_to_server() {
    $.ajax({
        type: "GET",
        url: "https://s3.amazonaws.com/simulation.njcoast.us/simulation/" + owner.toString() + "/" + sim_id + "/heatmap.json",
        //data: data,
        dataType: "json",
        //contentType: 'application/json',
        success: function (data) {
            console.log("EXPERT SIMULATION LOAD -- SUCCESS.", data);

            //save data
            addressPoints = data;

            //add to map
            heatmap = L.heatLayer(addressPoints.runup, {max: 4, radius: 25, gradient: {0.4: 'blue', 0.65: 'lime', 1: 'red'}, blur: 10}).addTo(mymap);
            $.notify( "Heatmap loaded", "success");
        },
        error: function (data) {
            console.log("EXPERT SIMULATION LOAD -- ERROR:", data)
            $.notify("Failed to load heatmap.", "error");
        }
    });
}

//auxiliary functions to link html input devices

//slider text box updates
function updateInput(e){
    var sibling = e.previousElementSibling || e.nextElementSibling;
    sibling.value = e.value;
    e.value = sibling.value;
}
