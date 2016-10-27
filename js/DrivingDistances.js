/// <reference path="../Scripts/typings/jquery/jquery.d.ts" />
/// <reference path="../typings/google.maps.d.ts" />
/// <reference path="site.ts" /> 
/// <reference path="FullScreenControl.ts"/>
/// <reference path="PrintMapControl.ts"/>
function repeat(chr, count) {
    "use strict";
    var str = "";
    for (var x = 0; x < count; x++) {
        str += chr;
    }
    return str;
}
String.prototype.padL = function (width, pad) {
    if (!width || width < 1) {
        return this;
    }
    if (!pad) {
        pad = " ";
    }
    var length = width - this.length;
    if (length < 1) {
        return this.substr(0, width);
    }
    return (repeat(pad, length) + this).substr(0, width);
};
var splitStartLocs;
var startIndex;
var splitEndLocs;
var endIndex;
var directions;
var count;
var map;
var stopped = false;
var geocodedLocations = [];
var mapItems;
var infowindow;
var bounds;
var originIndex;
var destinationIndex;
var errorCount = 0;
$(document).ready(function () {
  directions = new google.maps.DistanceMatrixService();
  var latLong = new google.maps.LatLng(36.778259, -119.417931);
  var options = {
      zoom: 5,
      center: latLong,
      mapTypeId: google.maps.MapTypeId.ROADMAP
  };
  map = new google.maps.Map(document.getElementById("map"), options);
  map.controls[google.maps.ControlPosition.TOP_RIGHT].push(FullScreenControl(map, null, null));
  map.controls[google.maps.ControlPosition.TOP_RIGHT].push(printMapControl(map));
});

function distanceUnits() {
    "use strict";
    var units = "KMs";
    if ($("#unitsMiles").is(":checked")) {
        units = "Miles";
    }
    return units;
}
function cleanArray(actual) {
    "use strict";
    var newArray = [];
    for (var i = 0; i < actual.length; i++) {
        if ($.trim(actual[i]) !== "") {
            newArray.push(actual[i]);
        }
    }
    return newArray;
}
function calculate() {
    "use strict";
    stopped = false;
    var units = distanceUnits();
    var header = "Start\t\tEnd\t\t" + units ;
    // if (!isCrow()) {
    //     header += "\tMinutes\tH:M";
    // }
    header += "\n";
    $("#distances").val(header);
    $("#results").html("");
    $("#distance").html("Distance (" + units + ")");
    var startdata = $("#startLocs").val();
    splitStartLocs = cleanArray(startdata.split("\n"));
    var enddata = $("#endLocs").val();
    splitEndLocs = cleanArray(enddata.split("\n"));
    startIndex = 0;
    endIndex = 0;
    count = 0;
    geocodedLocations = [];
    bounds = null;
    if (mapItems != null) {
        for (var i = 0; i < mapItems.length; i++) {
            mapItems[i].setMap(null);
        }
    }
    mapItems = [];
    infowindow = new google.maps.InfoWindow({
        content: ""
    });
    calculateNextGeocode();
}
function addLine(start, end, distance, minutes, hm) {
    "use strict";
    var csvData = start + "\t" + end + "\t" + distance;
    csvData += "\n";
    $("#distances").val($("#distances").val() + csvData);
    // add to table
    var row = "<tr><td>" + start + "</td><td>" + end + "</td><td><b>" + distance + "</b></td>";
    // if (!isCrow()) {
    //     row += "<td>" + minutes + "</td><td>" + hm + "</td>";
    // }
    row += "</tr>";
    $("#results").append(row);
}
function addFailure(error) {
    "use strict";
    addLine(splitStartLocs[startIndex], splitEndLocs[endIndex], error, "Failed", "Failed");
}
function isCrow() {
    "use strict";
    return $("#routeType").val() === "As the crow flies";
}
var delay = 0;
function getTotal() {
    "use strict";
    var total = Math.min(splitStartLocs.length, splitEndLocs.length);
    if ($("#calculateAll").is(":checked")) {
        total = splitStartLocs.length * splitEndLocs.length;
    }
    return total;
}
function calculateNextGeocode() {
    "use strict";
    $("#status").html(" Geocoding " + (count + 1).toString() + " of " + getTotal());
    if ($("#locationsPostcodes").is(":checked")) {
        getStartPostcode();
    }
    else {
        var startLoc = parseLatLng(splitStartLocs[startIndex]);
        var endLoc = parseLatLng(splitEndLocs[endIndex]);
        if (startLoc == null || endLoc == null) {
            addFailure("Lat/long not recognised");
            gotoNextGeocode();
        }
        else {
            addMarkers(startLoc, endLoc);
        }
    }
}
function parseLatLng(location) {
    "use strict";
    // first try with a comma
    var splitLoc = location.split(",");
    if (splitLoc.length === 1) {
        // then with a space
        splitLoc = location.split(" ");
    }
    if (splitLoc.length === 2) {
        var lat = parseFloat(splitLoc[0]);
        var lng = parseFloat(splitLoc[1]);
        if (!isNaN(lat) && !isNaN(lng)) {
            return new google.maps.LatLng(lat, lng);
        }
    }
    return null;
}
function getStartPostcode() {
  "use strict";
  var startLoc = splitStartLocs[startIndex];
  if (geocodedLocations[startLoc] != null) {
    getEndPostcode(geocodedLocations[startLoc]);
  }
  else {
    geocodeAddress(getFullAddress(startLoc), function (gLatLng) {
      if (gLatLng != null) {
        startLoc = gLatLng;
      }
      getEndPostcode(startLoc);
    });
  }
}
function getEndPostcode(startLoc) {
  "use strict";
  var endLoc = splitEndLocs[endIndex];
  if (geocodedLocations[endLoc] != null) {
    addMarkers(startLoc, geocodedLocations[endLoc]);
  }
  else {
    geocodeAddress(getFullAddress(endLoc), function (gLatLng) {
      if (gLatLng != null) {
        endLoc = gLatLng;
      }
      addMarkers(startLoc, endLoc);
    });
  }
}
function getFullAddress(address) {
    "use strict";
    var country = $("#country").val();
    if (country !== "") {
        return address + ", " + country;
    }
    return address;
}
function addMarker(name, location, icon) {
    "use strict";
    if (location instanceof google.maps.LatLng) {
        if (geocodedLocations[name] == null) {
            geocodedLocations[name] = location;
            var options = {
                map: map,
                title: name,
                position: location
            };
            var marker = new google.maps.Marker(options);
            mapItems.push(marker);
            if (bounds == null) {
                bounds = new google.maps.LatLngBounds(location, location);
            }
            else {
                bounds = bounds.extend(location);
            }
            map.fitBounds(bounds);
            map.panToBounds(bounds);
            google.maps.event.addListener(marker, "click", function () {
                if (isCrow()) {
                    var text = "<div><b>" + name + "</b></div>";
                    var locations;
                    if (splitStartLocs.indexOf(name) > -1) {
                        locations = splitEndLocs;
                    }
                    else {
                        locations = splitStartLocs;
                    }
                    for (var i = 0; i < locations.length; i++) {
                        // populate info window
                        var distance = google.maps.geometry.spherical.computeDistanceBetween(location, geocodedLocations[locations[i]]);
                        var distanceDisplay = getDistanceDisplay(distance);
                        text += "<div>Distance to " + locations[i] + ": " + distanceDisplay + " " + distanceUnits() + "</div>";
                        // add lines  
                        var coords = [location, geocodedLocations[locations[i]]];
                        var lineText = "Distance from " + name + " to " + locations[i] + ": " + distanceDisplay + " " + distanceUnits();
                        var line = new google.maps.Polyline({
                            path: coords,
                            geodesic: true,
                            strokeColor: "#0000FF",
                            strokeOpacity: 1.0,
                            strokeWeight: 4,
                            map: map,
                            clickable: true
                        });
                        line.text = lineText;
                        google.maps.event.addListener(line, "click", function () {
                            var thisLine = this;
                            infowindow.setContent(thisLine.text);
                            infowindow.open(map, thisLine);
                        });
                        mapItems.push(line);
                    }
                    infowindow.setContent(text);
                    infowindow.open(map, marker);
                }
            });
        }
    }
}
function addMarkers(startLoc, endLoc) {
    "use strict";
    addMarker(splitStartLocs[startIndex], startLoc, "images/green.png");
    addMarker(splitEndLocs[endIndex], endLoc, "images/red.png");
    if (isCrow()) {
        if (startLoc instanceof google.maps.LatLng && endLoc instanceof google.maps.LatLng) {
            // calculate the distance
            var distance = google.maps.geometry.spherical.computeDistanceBetween(startLoc, endLoc);
            addLine(splitStartLocs[startIndex], splitEndLocs[endIndex], getDistanceDisplay(distance), "?", "?");
        }
        else {
            if (!(startLoc instanceof google.maps.LatLng)) {
                addFailure("Location " + startLoc + " not recognised");
            }
            else {
                addFailure("Location " + endLoc + " not recognised");
            }
        }
    }
    gotoNextGeocode();
}
function getTravelMode() {
    "use strict";
    var routeType = $("#routeType").val();
    var travelMode = google.maps.TravelMode.DRIVING;
    if (routeType === "Walking") {
        travelMode = google.maps.TravelMode.WALKING;
    }
    else if (routeType === "Public transport") {
        travelMode = google.maps.TravelMode.TRANSIT;
    }
    else if (routeType === "Cycling") {
        travelMode = google.maps.TravelMode.BICYCLING;
    }
    return travelMode;
}
function calculateRoutes() {
    "use strict";
    errorCount = 0;
    if ($("#calculateAll").is(":checked")) {
        originIndex = 0;
        destinationIndex = 0;
        calculateNextRouteBatch();
    }
    else {
        // calculate one to one
        count = 0;
        calculateNext();
    }
}
function gotoNextRouteBatch() {
    "use strict";
    originIndex += 10;
    if (originIndex >= splitStartLocs.length) {
        originIndex = 0;
        destinationIndex += 10;
    }
    if (destinationIndex >= splitEndLocs.length) {
        $("#status").html(" Finish");
        $("#delay").html("");
    }
    else {
        calculateNextRouteBatch();
    }
}
function calculateNextRouteBatch() {
    "use strict";
    if (stopped) {
        $("#status").html(" Stopped");
        $("#delay").html("");
        return;
    }
    var originEnd = Math.min(originIndex + 10, splitStartLocs.length);
    var destEnd = Math.min(destinationIndex + 10, splitEndLocs.length);
    $("#status").html(" Calculating start points " + (originIndex + 1).toString() + " to " + originEnd.toString() +
        ", end points " + (destinationIndex + 1).toString() + " to " + destEnd.toString());
    // get driving distance and time
    var travelMode = getTravelMode();
    var startLatLngs = [];
    for (var i = originIndex; i < originEnd; i++) {
        var startLatLng = geocodedLocations[splitStartLocs[i]];
        if (startLatLng != null) {
            startLatLngs.push(startLatLng);
        }
        else {
          startLatLngs.push(getFullAddress(splitStartLocs[i]));
        }
    }
    var endLatLngs = [];
    for (var j = destinationIndex; j < destEnd; j++) {
        var endLatLng = geocodedLocations[splitEndLocs[j]];
        if (endLatLng != null) {
            endLatLngs.push(endLatLng);
        }
        else {
          endLatLngs.push(getFullAddress(splitEndLocs[j]));
        }
    }
    var request = {
        origins: startLatLngs,
        destinations: endLatLngs,
        travelMode: travelMode
    };
    directions.getDistanceMatrix(request, function (result, status) {
        if (status === google.maps.DistanceMatrixStatus.OK) {
            for (var i = 0; i < result.rows.length; i++) {
                for (var j = 0; j < result.rows[i].elements.length; j++) {
                    var row = result.rows[i].elements[j];
                    if (row.status === google.maps.DistanceMatrixElementStatus.OK) {
                        var minTime = row.duration.value;
                        var minDistance = row.distance.value;
                        var distanceDisplay = getDistanceDisplay(minDistance);
                        var m = Math.round(minTime / 60);
                        var h = Math.floor(m / 60);
                        var hm = h + ":" + (m - (h * 60)).toString().padL(2, "0");
                        addLine(splitStartLocs[originIndex + i], splitEndLocs[destinationIndex + j], distanceDisplay, m.toString(), hm);
                    }
                    else {
                        addFailure(row.status.toString());
                    }
                }
            }
            errorCount = 0;
        }
        else if (status === google.maps.DistanceMatrixStatus.OVER_QUERY_LIMIT) {
            delay += 100;
            errorCount++;
            if (errorCount < 10) {
                $("#delay").html("Current delay is " + delay + "ms");
                setTimeout(function () { calculateNextRouteBatch(); }, delay);
            }
            else {
                $("#status").html(" Oops. It looks like the site has exceeded its quota of requests for today. Come back tomorrow!");
                $("#delay").html("");
            }
            return;
        }
        else {
            errorCount = 0;
            addFailure(status.toString());
        }
        gotoNextRouteBatch();
    });
}
function getDistanceDisplay(distance) {
    "use strict";
    var distanceDisplay = (distance / 1000).toFixed(2);
    if ($("#unitsMiles").is(":checked")) {
        distanceDisplay = ((distance / 1.609344) / 1000).toFixed(2);
    }
    return distanceDisplay;
}
function gotoNextGeocode() {
    "use strict";
    if (delay > 0) {
        delay -= 100;
    }
    endIndex++;
    count++;
    if (endIndex >= splitEndLocs.length) {
        endIndex = 0;
        startIndex++;
    }
    if (!stopped && (count < splitStartLocs.length * splitEndLocs.length)) {
        setTimeout(function () { calculateNextGeocode(); }, delay);
    }
    else {
        if (isCrow()) {
            $("#status").html(" Finish");
            $("#delay").html("");
        }
        else {
            calculateRoutes();
        }
    }
}
function stop() {
    "use strict";
    stopped = true;
}
// one-to-one
function calculateNext() {
    "use strict";
    $("#status").html(" Calculating " + (count + 1).toString() + " of " + getTotal());
    var startLoc = geocodedLocations[splitStartLocs[count]];
    var endLoc = geocodedLocations[splitEndLocs[count]];
    checkRoute(startLoc, endLoc);
}
function checkRoute(startLoc, endLoc) {
    "use strict";
    if (isCrow()) {
        if (startLoc instanceof google.maps.LatLng && endLoc instanceof google.maps.LatLng) {
            // calculate the distance
            var distance = google.maps.geometry.spherical.computeDistanceBetween(startLoc, endLoc);
            addLine(splitStartLocs[count], splitEndLocs[count], getDistanceDisplay(distance), "?", "?");
        }
        else {
            if (!(startLoc instanceof google.maps.LatLng)) {
                addFailure("Location " + startLoc + " not recognised");
            }
            else {
                addFailure("Location " + endLoc + " not recognised");
            }
        }
        gotoNext();
    }
    else {
        getRoute(startLoc, endLoc);
    }
}
function getRoute(startLatLng, endLatLng) {
    "use strict";
    // get driving distance and time
    var travelMode = getTravelMode();
    var request = {
        origin: startLatLng,
        destination: endLatLng,
        travelMode: travelMode
    };
    var otoDirections = new google.maps.DirectionsService();
    otoDirections.route(request, function (result, status) {
        if (status === google.maps.DirectionsStatus.OK) {
            var distance = getRouteDistance(result.routes[0]);
            var time = getRouteTime(result.routes[0]);
            var distanceDisplay = getDistanceDisplay(distance);
            var m = Math.round(time / 60);
            var h = Math.floor(m / 60);
            var hm = h + ":" + (m - (h * 60)).toString().padL(2, "0");
            addLine(splitStartLocs[count], splitEndLocs[count], distanceDisplay, m.toString(), hm);
        }
        else if (status === google.maps.DirectionsStatus.OVER_QUERY_LIMIT) {
            delay += 100;
            $("#delay").html("Current delay is " + delay + "ms");
            setTimeout(function () { calculateNext(); }, delay);
            return;
        }
        else {
            addFailure(getDirectionStatusText(status));
        }
        gotoNext();
    });
}
function getRouteTime(theRoute) {
    "use strict";
    var time = 0;
    for (var i = 0; i < theRoute.legs.length; i++) {
        var theLeg = theRoute.legs[i];
        time += theLeg.duration.value;
    }
    return time;
}
function getRouteDistance(theRoute) {
    "use strict";
    var distance = 0;
    for (var i = 0; i < theRoute.legs.length; i++) {
        var theLeg = theRoute.legs[i];
        distance += theLeg.distance.value;
    }
    return distance;
}
function gotoNext() {
    "use strict";
    if (delay > 0) {
        delay -= 100;
    }
    count++;
    if (!stopped && (count < getTotal())) {
        setTimeout(function () { calculateNext(); }, delay);
    }
    else {
        $("#status").html(" Finish");
        $("#delay").html("");
    }
}
