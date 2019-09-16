/*
 * Purpose:            js file for creating heatmaps for maps.html and map_expert.html.
 * @author             James Sweet <jsweet@nd.edu>
 * Org:                CRC at Notre Dame
 * Date:               05/01/2018
 *
 * Associated files:   maps.html        Main map view,
 *                     map_expert.html  Simulation view.
 *
 * @description       Heatmap generation code.
 *
 */

 // Utility Function
 function round_to_precision(x, precision) {
    var y = +x + (precision === undefined ? 0.5 : precision/2);
    return y - (y % (precision === undefined ? 1 : +precision));
}

 /*
    This function takes a set of data and a string to define the plane of the map that
    the surge heatmap should be added to. It visualizes the first version of the surge
    data.
*/
function create_surge_heatmap(data, lpane){
    var heatData = {
        max: 10.00,
        data: []
    };

    var data_array = data;
    for( var i = 0; i < data.length; i++ ){
        heatData.data.push({
            lat: data[i][0],
            lng: data[i][1],
            value: Math.max(data[i][2], 0.0),
        });
    }

    var cfg = {
        // radius should be small ONLY if scaleRadius is true (or small radius is intended)
        // if scaleRadius is false it will be the constant radius used in pixels
        "radius": 0.0025,
        "opacity": 0.65,
        "maxOpacity": 0.75,
        // scales the radius based on map zoom
        "scaleRadius": true,
        "gradient": {
            // enter n keys between 0 and 1 here
            // for gradient color customization
            '.1': 'blue',
            '.3': 'yellow',
            '.6': 'orange',
            '.9': 'red',
        },
        // if set to false the heatmap uses the global maximum for colorization
        // if activated: uses the data maximum within the current map boundaries
        //   (there will always be a red spot with useLocalExtremas true)
        "useLocalExtrema": false,
        // which field name in your data represents the latitude - default "lat"
        latField: 'lat',
        // which field name in your data represents the longitude - default "lng"
        lngField: 'lng',
        // which field name in your data represents the data value - default "value"
        valueField: 'value',
        pane: lpane
    };

    var hLayer = new HeatmapOverlay(cfg);
    hLayer.setData(heatData);

    return hLayer;
}

/*
    This function takes a set of data and a string to define the plane of the map that
    the wind heatmap should be added to. It visualizes the first version of the wind
    data.
*/
function create_wind_heatmap(data, lpane){
    var heatData = {
        max: 200.00,
        data: []
    };

    var data_array = data;
    for( var i = 0; i < data.length; i++ ){
        heatData.data.push({
            lat: data[i][0],
            lng: data[i][1],
            value: Math.max(data[i][2], 0.0),
        });
    }

    var cfg = {
        // radius should be small ONLY if scaleRadius is true (or small radius is intended)
        // if scaleRadius is false it will be the constant radius used in pixels
        "radius": 0.0075,
        "opacity": 0.65,
        "maxOpacity": 0.75,
        // scales the radius based on map zoom
        "scaleRadius": true,
        "gradient": {
            '0.37': '#ffffcc',
            '0.475': '#ffe775',
            '0.555': '#ffc140',
            '0.65': '#ff8f20',
            '0.785': '#ff6060',
        },
        // if set to false the heatmap uses the global maximum for colorization
        // if activated: uses the data maximum within the current map boundaries
        //   (there will always be a red spot with useLocalExtremas true)
        "useLocalExtrema": false,
        // which field name in your data represents the latitude - default "lat"
        latField: 'lat',
        // which field name in your data represents the longitude - default "lng"
        lngField: 'lng',
        // which field name in your data represents the data value - default "value"
        valueField: 'value',
        pane: lpane
    };

    var hLayer = new HeatmapOverlay(cfg);
    hLayer.setData(heatData);

    return hLayer;
}

// Legend Code
var legend = {}
var legend_count = {}

// This function generates a legend bar for the first version of the surge data
function create_surge_legend(){
    function getColor(d) {
        return d > 9 ? 'red' : d > 6  ? 'orange' : d > 3  ? 'yellow' :  'black';
    }

    var legend = L.control({position: 'bottomleft'});
    legend.onAdd = function (map) {

        var div = L.DomUtil.create('div', 'info legend'),
            heights = [0, 3, 6, 9],
            labels = [];

        // loop through our density intervals and generate a label with a colored square for each interval
        div.innerHTML = "Surge (ft):<br>";
        for (var i = 0; i < heights.length; i++) {
            div.innerHTML += '<i style="background:' + getColor(heights[i] + 1) + '"></i> ' + round_to_precision(heights[i],0.5);
            if(heights[i + 1]){
                div.innerHTML += '<br>';
            }
        }

        return div;
    };

    return legend;
}

// This function takes the data for a second version surge layer and creates a legend based
// on the data.
function create_surge_legend_new(data){
    var lData = []
    for( var i = 0; i < data.features.length; i++ ){
        lData.push({height: data.features[i].properties.name.replace("Level ", ""), color: data.features[i].properties.fill})
    }
    bracket = parseInt(lData.length/5.0);
    lData = lData.sort((a, b) => parseFloat(a.height) > parseFloat(b.height)).filter((e,i) => i % bracket === 0);

    var sLegend = L.control({position: 'bottomleft'});
    sLegend.onAdd = function (map) {
        var div = L.DomUtil.create('div', 'info legend');
        div.innerHTML = "Surge (ft):<br>";
        for (var i = 0; i < lData.length; i++) {
            div.innerHTML += '<i style="background:' + lData[i].color + '"></i> ' + round_to_precision(lData[i].height,0.5)
            if( lData[i+1] ){
                div.innerHTML += '&ndash;' + round_to_precision(lData[i+1].height,0.5) + '<br>';
            }else{
                div.innerHTML += '+' ;
            }
        }
        return div;
    };

    return sLegend;
}

// This function adds a generated surge legend to the specified map, checking
// to see if it has already been added. It sets up a reference counter for the
// number of layers using this legend.
function add_surge_legend(mymap, new_style, data){
    if( legend['surge'] == null ){
        legend_count['surge'] = 1;
        if( new_style ){
            legend['surge'] = create_surge_legend_new(data).addTo(mymap);
        }else{
            legend['surge'] = create_surge_legend().addTo(mymap);
        }
    }else{
        legend_count['surge'] += 1;
    }
}

// This function removes a count from the surge layer and if it determines
// that no more layers require the legend it destroys the legend itself.
function del_surge_legend(mymap){
    legend_count['surge'] -= 1;
    if( legend_count['surge'] <= 0 ){
        legend['surge'].remove();
        delete legend['surge'];
        legend_count['surge'] = 0;
    }
}

// This function generates a legend bar for the first version of the wind data
function create_wind_legend(L){
    function getColor(d) {
        return d > 78.5 ? '#ff6060' : d > 65  ? '#ff8f20' : d > 55.5  ? '#ffc140' : d > 47.5  ? '#ffe775' : '#ffffcc';
    }

    var legend = L.control({position: 'bottomleft'});
    legend.onAdd = function (map) {

        var div = L.DomUtil.create('div', 'info legend'),
            heights = [37, 47.5, 55.5, 65, 78.5],
            labels = [];

        // loop through our density intervals and generate a label with a colored square for each interval
        div.innerHTML = "Wind (mph):<br>";
        for (var i = 0; i < heights.length; i++) {
            div.innerHTML +=
                '<i style="background:' + getColor(heights[i] + 1) + '"></i> ' +
                round_to_precision(heights[i], 0.5) + (round_to_precision(heights[i + 1],0.5) ? '&ndash;' + round_to_precision(heights[i + 1],0.5) + '<br>' : '+');
        }

        return div;
    };

    return legend;
}

// This function takes the data for a second version wind layer and creates a legend based
// on the data.
function create_wind_legend_new(data){
    var lData = []
    for( var i = 0; i < data.features.length; i++ ){
        lData.push({height: data.features[i].properties.name.replace("Level ", ""), color: data.features[i].properties.fill})
    }
    bracket = parseInt(lData.length/5.0);
    lData = lData.sort((a, b) => parseFloat(a.height) > parseFloat(b.height)).filter((e,i) => i % bracket === 0);

    var wLegend = L.control({position: 'bottomleft'});
    wLegend.onAdd = function (map) {
        var div = L.DomUtil.create('div', 'info legend');
        div.innerHTML = "Wind (mph):<br>";
        for (var i = 0; i < lData.length; i++) {
            div.innerHTML += '<i style="background:' + lData[i].color + '"></i> ' + round_to_precision(lData[i].height, 0.5)
            if( lData[i+1] ){
                div.innerHTML += '&ndash;' + round_to_precision(lData[i+1].height,0.5) + '<br>';
            }else{
                div.innerHTML += '+' ;
            }
        }
        return div;
    };

    return wLegend;
}

// This function adds a generated wind legend to the specified map, checking
// to see if it has already been added. It sets up a reference counter for the
// number of layers using this legend.
function add_wind_legend(mymap, new_style, data){
    if( legend['wind'] == null ){
        legend_count['wind'] = 1;
        if( new_style ){
            legend['wind'] = create_wind_legend_new(data).addTo(mymap);
        }else{
            legend['wind'] = create_wind_legend().addTo(mymap);
        }
    }else{
        legend_count['wind'] += 1;
    }
}

// This function removes a count from the wind layer and if it determines
// that no more layers require the legend it destroys the legend itself.
function del_wind_legend(){
    legend_count['wind'] -= 1;
    if( legend_count['wind'] <= 0 ){
        legend['wind'].remove();
        delete legend['wind'];
        legend_count['wind'] = 0;
    }
}

// This function generates a legend bar for the runup data
function create_runup_legend(L){
    var legend = L.control({position: 'bottomleft'});
    legend.onAdd = function (map) {
        var div = L.DomUtil.create('div', 'info legend');
        div.innerHTML = "Runup:<br>";
        div.innerHTML += '<i style="background:blue"></i>Run Up Limit</br>';
        div.innerHTML += '<i style="background:green"></i>LiMWA';

        return div;
    };

    return legend;
}

// This function adds a generated runup legend to the specified map, checking
// to see if it has already been added. It sets up a reference counter for the
// number of layers using this legend.
function add_runup_legend(mymap){
    if( legend['runup'] == null ){
        legend_count['runup'] = 1;
        legend['runup'] = create_runup_legend(L).addTo(mymap);
    }else{
        legend_count['runup'] += 1;
    }
}

// This function removes a count from the wind layer and if it determines
// that no more layers require the legend it destroys the legend itself.
function del_runup_legend(){
    legend_count['runup'] -= 1;
    if( legend_count['runup'] <= 0 ){
        legend['runup'].remove();
        delete legend['runup'];
        legend_count['runup'] = 0;
    }
}
