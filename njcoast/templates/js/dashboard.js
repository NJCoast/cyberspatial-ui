 /*
  * Purpose:            js file for dashboard.html.
  * @author             Beth Caldwell, Chris Sweet <csweet1@nd.edu>
  * Org:                CRC at Notre Dame
  * Date:               04/01/2018
  *
  * Associated files:   dashboard.html    Explore user profile, maps, layers and simulations page,
  *
  * @description        User dashboard code for dashboard.html.
  *
  * Functions:
  *     $(document).ready   Load municipalities in county.
  *     open_membership     Show members of a group I am in.
  *     flip_edit_main      Flip between main dashboard and edit user data.
  *     validateEmail       Check email input OK.
  *     save_changes        Save user profile changes.
  *     create_map          Create a new map and launch it.
  *     delete_map          Delete map after showing OK modal.
  *     delete_map_ajax     Actual map delete.
  *     request_munis       Request additional municipalities to belong to.
  *     swap_municipality   Set primary muni from those I have been given access to.
  */

var toTitleCase = function (str) {
	str = str.toLowerCase().split(' ');
	for (var i = 0; i < str.length; i++) {
		str[i] = str[i].charAt(0).toUpperCase() + str[i].slice(1);
	}
	return str.join(' ');
};


$(document).ready(function() {

     //setup for select input
      $('.js-example-basic-multiple').select2({ allowClear: true }); //, minimumInputLength: 1

      //do Ajax call to get munis in county
      $.ajax({
          type: "GET",
          url: "/municipalities_in_county/",
          data: {
              'county': 'All'
          },
          dataType: "json",
          success: function(result) {
              console.log("MUNIS FILTERED BY COUNTY -- SUCCESS! " + result.status);

              //if we got munis back
              if(result.status){
                  /* Remove all options from the select list */
                  //$('#muniList').empty();
                  var x = document.getElementById("muniList");
                  for(var i=0; i<result.data.length; i++){
                      //if(result.data[i] == {{ user.njcusermeta.municipality.name }}) continue;
                      var option = document.createElement("option");
                      option.text = result.data[i];
                      option.value = result.ids[i];
                      x.add(option);
                  }

              }else{
                  //or failure
                  console.log("MUNIS FILTERED BY COUNTY ERROR:", result)
              }
          },
          error: function(result) {
              console.log("MUNIS FILTERED BY COUNTY ERROR:", result)
          }
      });

      var app = new Vue({
        delimiters: ['${', '}'],
        el: '#activeStormGroup',
        data: {
            items: []
        },
        created: function () {
            this.fetchData();
        },
        methods: {
          fetchData: function () {
            var path = (userSimulationPath + "/metadata.json").replace("/simulation/", "/");
            $.get(path, (data) => {
                for(var i = 0; i < data.active_storms.length; i++ ){
                    if( data.active_storms[i]['out_of_bounds'] == undefined ){
                        data.active_storms[i]['out_of_bounds'] = false;
                    }
                    data.active_storms[i]['name'] = toTitleCase(data.active_storms[i]['name']);
                }

                // Sort Data
                data.active_storms.sort(function(a, b) {
                    if( a.out_of_bounds && !b.out_of_bounds ){
                        return 1;
                    }

                    if( !a.out_of_bounds && b.out_of_bounds ){
                        return -1;
                    }

                    if( Date.parse(a.last_updated) < Date.parse(b.last_updated) ){
                        return 1;
                    }

                    if( Date.parse(a.last_updated) > Date.parse(b.last_updated) ){
                        return -1;
                    }

                    return 0;
                });

                // Insert
                for(var i = 0; i < data.active_storms.length; i++ ){
                    this.items.push(data.active_storms[i]);
                }
            });
          },
          dateString: function(last_updated){
            var result = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(Date.parse(last_updated));
            return result.toString();
          }
        }
    })
});


//function to open group membership
function open_membership(object_name){
    var member_list = document.getElementById(object_name);
    var caret = document.getElementById(object_name+'_caret');

    //test if hidden
    if(member_list.classList.contains('hidden')){
        member_list.classList.remove("hidden");
        caret.classList.remove("fa-caret-down");
        caret.classList.add("fa-caret-right");
    }else{
        member_list.classList.add("hidden");
        caret.classList.remove("fa-caret-right");
        caret.classList.add("fa-caret-down");
    }

    return false;
}

//function to flip between main and edit
function flip_edit_main(edit){
    if(edit){
        document.getElementById("main_section").classList.add("hidden");
        document.getElementById("edit_section").classList.remove("hidden");
    }else{
        document.getElementById("main_section").classList.remove("hidden");
        document.getElementById("edit_section").classList.add("hidden");
    }
}

//check email input OK
function validateEmail(email) {
    var re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(String(email).toLowerCase());
}

//save user data
function save_changes(username){
    //check data integrity. Email
    //first email
    var email = document.getElementById("edit_email").value;
    if(!validateEmail(email)){

        //fade out modal
        $("#saveChanges-1").modal("hide");

        //open new modal to flag error
        document.getElementById("info_ok_modal").innerHTML = "Invalid email, please correct before saving.";
        $('#fixInput-1').modal()

        return;
    }

    //do Ajax call
    $.ajax({
        type: "POST",
        url: "/user/settings/",
        data: {
            'position': document.getElementById("edit_position").value,
            'name': document.getElementById("edit_name").value,
            'email': document.getElementById("edit_email").value,
            'voice': document.getElementById("edit_voice").value,
            'address_line_1': document.getElementById("edit_address_line_1").value,
            'address_line_2': document.getElementById("edit_address_line_2").value,
            'city': document.getElementById("edit_city").value,
            'zip': document.getElementById("edit_zip").value,
            'user': username,
            'action': 'update_profile'
        },
        dataType: "json",
        success: function(result) {
            console.log("USER APPROVAL -- SUCCESS!" + result.updated);

            if(result.updated){
                //copy over data if success
                document.getElementById("info_position").innerHTML = document.getElementById("edit_position").value;
                document.getElementById("info_name").innerHTML = document.getElementById("edit_name").value;
                document.getElementById("info_email").innerHTML = document.getElementById("edit_email").value;
                document.getElementById("info_voice").innerHTML = document.getElementById("edit_voice").value;
                document.getElementById("info_address_line_1").innerHTML = document.getElementById("edit_address_line_1").value;
                document.getElementById("info_address_line_2").innerHTML = document.getElementById("edit_address_line_2").value;
                document.getElementById("info_city").innerHTML = document.getElementById("edit_city").value;
                document.getElementById("info_zip").innerHTML = document.getElementById("edit_zip").value;

                //flip back to view
                flip_edit_main(false);

                //flag success
                $.notify("User updated", "success");
            }else{
                //or failure
                $.notify("Error updating user", "error");
            }

            //fade out modal
            $("#saveChanges-1").modal("hide");

        },
        error: function(result) {
            console.log("ERROR:", result)
            $.notify("Error updating user", "error");

            //fade out modal
            $("#saveChanges-1").modal("hide");
        }
    });

}

//create a new map and launch it
function create_map(){
    console.log("saving");
    $.ajax({
        type: "POST",
        url: "/maps/new/",
        data: {
            'name': document.getElementById("map_name").value,
            'description': document.getElementById("map_description").value
        },
        dataType: "json",
        success: function(result) {
            console.log("CREATE MAP -- SUCCESS!" + result.created);
            if(result.created){
                //go to new map
                window.location.href = "/map/" + result.id + "/";
            }else{
                $("#createMap-1").modal("hide");
                $.notify("Map creation error!", "error");
            }
        },
        error: function(result) {
            console.log("CREATE MAP ERROR:", result)
            //fade out modal
            $("#createMap-1").modal("hide");
            $.notify("Map could not be created!", "error");
        }
    });

}

//delete map in dashboard
function delete_map(id){
    //console.log("Delete map "+id);
    document.getElementById("delete_map_button").setAttribute('name', id);
    document.getElementById("editable_delete_modal").innerHTML = "Do you want to delete map \""+document.getElementById("list_name_"+id).innerHTML+"\"?";
    $("#deleteMap-1").modal("show");
}

//actual delete map in dashboard
function delete_map_ajax(id){
    console.log("Actually delete "+id);
    $.ajax({
        type: "GET",
        url: "/maps/new/",
        data: {
            'id': id,
            'action': 'delete'
        },
        dataType: "json",
        success: function(result) {
            console.log("DELETE MAP -- SUCCESS! " + result.deleted);

            //deleted?
            if(result.deleted){
                //remove list item
                document.getElementById("list_"+id).classList.add("hidden");
                $.notify("Map deleted!", "success");
            }

            //fade out modal
            $("#deleteMap-1").modal("hide");
        },
        error: function(result) {
            console.log("DELETE MAP ERROR:", result)

            //fade out modal
            $("#deleteMap-1").modal("hide");
            $.notify("Map could not be deleted!", "error");
        }
    });

}

//forward request for additional munis
function request_munis(){
    var munis = $("#muniList").val();
    var justi = $("#muniJustification").val();
    //console.log("Munis "+munis+","+justi);

    //test data
    if(munis != "" && justi != ""){

        //process data
        var jsondata = {};

        //get options
        var muni_id = [];

        //loop to add selected munis
        for(var i=0; i<munis.length; i++){
            muni_id.push(munis[i]);
        }

        //add to json
        jsondata["muni_id"] = muni_id;
        jsondata["justification"] = justi;

        console.log("c "+JSON.stringify(jsondata));

        //start the process
        $.ajax({
            type: "POST",
            url: "/user/update/",
            data: {
                'action': 'add_muni',
                'data': JSON.stringify(jsondata)
            },
            dataType: "json",
            success: function(result) {
                console.log("ADD MUNI -- SUCCESS!" + result.updated);
                //clear modal
                $('#reqMuni').modal('hide');
            },
            error: function(result) {
                console.log("ADD MUNI ERROR:", result)
                //clear modal
                $('#reqMuni').modal('hide');
            }
        });

    }else{  //missing data
        if(munis == null){  //if muni error
            document.getElementById('muniLabel').style.color = "red";
            document.getElementById("muniLabel").innerHTML = "Municipality(ies) required!";
        }else{
            document.getElementById('muniLabel').style.color = "black";
            document.getElementById("muniLabel").innerHTML = "Municipality(ies)";
        }
        if(justi == ""){    //if justification error
            document.getElementById('justiLabel').style.color = "red";
            document.getElementById("justiLabel").innerHTML = "Justification required!";
        }else{
            document.getElementById('justiLabel').style.color = "black";
            document.getElementById("justiLabel").innerHTML = "Justification";
        }
    }
}

//function for swapping current muni
function swap_municipality(name){
    //console.log("Muni "+name);

    //start the process
    $.ajax({
        type: "POST",
        url: "/user/update/",
        data: {
            'action': 'switch_muni',
            'municipality': name
        },
        dataType: "json",
        success: function(result) {
            console.log("SWITCH MUNI -- SUCCESS!" + result.updated);

            //if succesful
            if(result.updated){
                //set name
                document.getElementById('current_muni').innerHTML = name + ' <span>|</span> ' + result.role + '<i class="fa fa-caret-down" style="margin-left: 10px" aria-hidden="true"></i>';

                //get users
                var users = JSON.parse(result.group_users);
                var elmt = document.getElementById('main_membership');
                var ucount = users.length;
                elmt.innerHTML = "";

                for(var i=0; i<ucount; i++){
                    //console.log("User "+users[i])
                    elmt.innerHTML += `<li>${users[i]}</li>`;
                }

                //set muni data
                document.getElementById('muni_group_text').innerHTML = name;
                document.getElementById('muni_group_count').innerHTML = ucount + 1;
                document.getElementById('muni_group_heading').innerHTML = name;
            }

        },
        error: function(result) {
            console.log("SWITCH MUNI ERROR:", result)
        }
    });

}
