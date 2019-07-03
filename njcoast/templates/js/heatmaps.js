/*
 * Purpose:            js file for creating heatmaps for maps.html and map_expert.html.
 * @author             James Sweet <csweet1@nd.edu>
 * Org:                CRC at Notre Dame
 * Date:               05/01/2018
 *
 * Associated files:   maps.html        Main map view,
 *                     map_expert.html  Simulation view.
 *
 * @description       Heatmap generation code.
 *
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
            div.innerHTML += '<i style="background:' + getColor(heights[i] + 1) + '"></i> ' + heights[i];
            if(heights[i + 1]){
                div.innerHTML += '<br>';
            }
        }

        return div;
    };

    return legend;
}

function create_surge_legend_new(data){
    var lData = []
    for( var i = 0; i < data.features.length; i++ ){ 
        lData.push({height: data.features[i].properties.name.replace("Level ", ""), color: data.features[i].properties.fill})
    }
    bracket = Math.round(lData.length / 5.0)
    lData = lData.sort((a, b) => parseFloat(a.height) > parseFloat(b.height)).filter((e,i) => i % bracket === 0); 

    var sLegend = L.control({position: 'bottomleft'});
    sLegend.onAdd = function (map) {
        var div = L.DomUtil.create('div', 'info legend');
        div.innerHTML = "Surge :<br>";
        for (var i = 0; i < lData.length; i++) {
            div.innerHTML += '<i style="background:' + lData[i].color + '"></i> ' + lData[i].height 
            if( lData[i+1] ){
                div.innerHTML += '&ndash;' + lData[i+1].height + '<br>';
            }else{
                div.innerHTML += '+' ;
            }
        }
        return div;
    };

    return sLegend;
}

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

function del_surge_legend(mymap){ 
    legend_count['surge'] -= 1;
    if( legend_count['surge'] <= 0 ){
        legend['surge'].remove();
        delete legend['surge'];
        legend_count['surge'] = 0;
    }
}

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
                heights[i] + (heights[i + 1] ? '&ndash;' + heights[i + 1] + '<br>' : '+');
        }

        return div;
    };

    return legend;
}

function create_wind_legend_new(data){
    var lData = []
    for( var i = 0; i < data.features.length; i++ ){
        lData.push({height: data.features[i].properties.name.replace("Level ", ""), color: data.features[i].properties.fill})
    }
    bracket = Math.round(lData.length / 5.0)
    lData = lData.sort((a, b) => parseFloat(a.height) > parseFloat(b.height)).filter((e,i) => i % bracket === 0);

    var wLegend = L.control({position: 'bottomleft'});
    wLegend.onAdd = function (map) {
        var div = L.DomUtil.create('div', 'info legend');
        div.innerHTML = "Wind :<br>";
        for (var i = 0; i < lData.length; i++) {
            div.innerHTML += '<i style="background:' + lData[i].color + '"></i> ' + lData[i].height 
            if( lData[i+1] ){
                div.innerHTML += '&ndash;' + lData[i+1].height + '<br>';
            }else{
                div.innerHTML += '+' ;
            }
        }
        return div;
    };

    return wLegend;
}

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

function del_wind_legend(){
    legend_count['wind'] -= 1;
    if( legend_count['wind'] <= 0 ){
        legend['wind'].remove();
        delete legend['wind'];
        legend_count['wind'] = 0;
    }
}

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

function add_runup_legend(mymap){
    if( legend['runup'] == null ){
        legend_count['runup'] = 1;
        legend['runup'] = create_runup_legend(L).addTo(mymap);
    }else{
        legend_count['runup'] += 1;
    }
}

function del_runup_legend(){
    legend_count['runup'] -= 1;
    if( legend_count['runup'] <= 0 ){
        legend['runup'].remove();
        delete legend['runup'];
        legend_count['runup'] = 0;
    }
}
