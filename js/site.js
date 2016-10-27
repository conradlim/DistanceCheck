/// <reference path="../Scripts/typings/jquery/jquery.d.ts" />
/// <reference path="../Scripts/typings/jqueryui/jqueryui.d.ts" />
/// <reference path="../Scripts/typings/bootstrap/bootstrap.d.ts" />
/// <reference path="../Scripts/typings/flot/jquery.flot.d.ts" />
/// <reference path="../typings/google.maps.d.ts" />
//#region flot helpers
function numberFormatter(v, axis) {
    "use strict";
    return addCommas(v.toFixed(axis.tickDecimals));
}
function showTooltip(x, y, contents) {
    "use strict";
    if ($("#tooltip").length === 0) {
        $("<div id=\"tooltip\"></div>")
            .css({
            position: "absolute",
            display: "none",
            border: "1px solid #fdd",
            padding: "2px",
            "background-color": "#fee",
            opacity: 0.80
        })
            .appendTo("body");
    }
    $("#tooltip").html(contents).css({
        top: y,
        left: x + 20
    }).show();
}
//#endregion
//#region elevation calculation
var ElevationCalculator = (function () {
    function ElevationCalculator(locations, callback, useGoogle, completeCallback) {
        this.elevations = [];
        this.stop = false;
        this.locations = locations;
        this.callback = callback;
        this.useGoogle = useGoogle;
        this.completeCallback = completeCallback;
    }
    ElevationCalculator.prototype.calculate = function () {
        if (this.locations.length === 0) {
            this.callback("Elevation calculation failed. No locations were supplied");
            return;
        }
        this.callback("Calculating elevation for " + this.locations.length + " locations...");
        this.elevations = [];
        this.currentPos = 0;
        this.getElevation();
    };
    ElevationCalculator.prototype.stopCalculation = function () {
        this.stop = true;
    };
    ElevationCalculator.prototype.getElevation = function () {
        "use strict";
        if (this.stop) {
            this.callback("Stopping calculation");
            return;
        }
        // calculate the elevation of the route
        var locationsPart = [];
        var endPos = Math.min(this.locations.length, this.currentPos + 100);
        for (var i = this.currentPos; i < endPos; i++) {
            locationsPart.push(this.locations[i]);
        }
        this.callback("Calculating elevation for " + this.currentPos + " to " + endPos + " (of " + this.locations.length + ")...");
        if (this.useGoogle) {
            this.calculateElevationWithGoogle(locationsPart);
        }
        else {
            this.calculateElevationWithBing(locationsPart);
        }
    };
    ElevationCalculator.prototype.calculateElevationWithGoogle = function (locationsPart) {
        "use strict";
        var _this = this;
        var positionalRequest = {
            locations: locationsPart
        };
        var elevator = new google.maps.ElevationService();
        // initiate the location request
        elevator.getElevationForLocations(positionalRequest, function (results, status) {
            if (status === google.maps.ElevationStatus.OK) {
                for (var i = 0; i < results.length; i++) {
                    _this.elevations.push(results[i].elevation);
                }
                _this.moveNextOrFinish();
            }
            else {
                if (status === google.maps.ElevationStatus.OVER_QUERY_LIMIT) {
                    var end = Math.min(_this.currentPos + 100, _this.locations.length);
                    _this.callback("Over query limit calculating the elevation for " + _this.currentPos + " to " +
                        end + " (of " + _this.locations.length + "), waiting 1 second before retrying");
                    setTimeout(function () { _this.getElevation(); }, 1000);
                }
                else {
                    _this.callback("An error occurred calculating the elevation - " +
                        ElevationCalculator.elevationStatusDescription(status));
                }
            }
        });
    };
    ElevationCalculator.elevationStatusDescription = function (status) {
        "use strict";
        switch (status) {
            case google.maps.ElevationStatus.OVER_QUERY_LIMIT:
                return "Over query limit";
            case google.maps.ElevationStatus.UNKNOWN_ERROR:
                return "Unknown error";
            case google.maps.ElevationStatus.INVALID_REQUEST:
                return "Invalid request";
            case google.maps.ElevationStatus.REQUEST_DENIED:
                return "Request denied";
            default:
                return status.toString();
        }
    };
    ElevationCalculator.prototype.calculateElevationWithBing = function (locationsPart) {
        "use strict";
        var _this = this;
        // make an AJAX request to Bing
        var url = "http://dev.virtualearth.net/REST/v1/Elevation/List?" +
            "key=AntrTMH-ZJdIfOHs2kyTIcG333TAMGGGU6LcvAd4glga_5ekMcKENnJ1AWf8jrwB";
        url += "&points=" + this.encodePoints(locationsPart);
        $.ajax(url, {
            dataType: "jsonp",
            jsonp: "jsonp",
            success: function (data) {
                // read the data
                var results = data.resourceSets[0].resources[0].elevations;
                for (var i = 0; i < results.length; i++) {
                    _this.elevations.push(results[i]);
                }
                _this.moveNextOrFinish();
            },
            error: function (jqXhr, textStatus, errorThrown) {
                _this.callback("An error occurred calculating the elevation - " + errorThrown);
            }
        });
    };
    ElevationCalculator.prototype.encodePoints = function (points) {
        "use strict";
        var latitude = 0;
        var longitude = 0;
        var result = [];
        for (var i = 0; i < points.length; i++) {
            var point = points[i];
            // step 2
            var newLatitude = Math.round(point.lat() * 100000);
            var newLongitude = Math.round(point.lng() * 100000);
            // step 3
            var dy = newLatitude - latitude;
            var dx = newLongitude - longitude;
            latitude = newLatitude;
            longitude = newLongitude;
            // step 4 and 5
            dy = (dy << 1) ^ (dy >> 31);
            dx = (dx << 1) ^ (dx >> 31);
            // step 6
            var index = ((dy + dx) * (dy + dx + 1) / 2) + dy;
            while (index > 0) {
                // step 7
                var rem = index & 31;
                index = (index - rem) / 32;
                // step 8
                if (index > 0) {
                    rem += 32;
                }
                // step 9
                result.push("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-"[rem]);
            }
        }
        // step 10
        return result.join("");
    };
    ElevationCalculator.prototype.moveNextOrFinish = function () {
        "use strict";
        if (this.stop) {
            this.callback("Stopping calculation");
            return;
        }
        this.currentPos += 100;
        if (this.currentPos >= this.locations.length) {
            this.callback("Elevation calculated using " + this.locations.length + " locations");
            this.completeCallback(this.elevations);
        }
        else {
            this.getElevation();
        }
    };
    return ElevationCalculator;
}());
//#endregion
//#region table row clicker
$(document).ready(function () {
    attachRowClicker();
});
function attachRowClicker() {
    "use strict";
    $(".table-hover tr").click(function (e) {
        if (rowLink(e.currentTarget) != null) {
            window.location.href = rowLink(e.currentTarget);
        }
    }).hover(function (e) {
        if (rowLink(e.currentTarget) != null) {
            $(e.currentTarget).toggleClass("hover");
        }
    });
}
function rowLink(e) {
    "use strict";
    return $(e).find("a").attr("href");
}
//#endregion
//#region kml support
function kmlDocumentStart() {
    "use strict";
    return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n" +
        "<kml xmlns=\"http://www.opengis.net/kml/2.2\">\n" + "<Document>\n";
}
function kmlDocumentEnd() {
    "use strict";
    return "</Document>\n</kml>";
}
function kmlLineStart() {
    "use strict";
    return "<LineString><coordinates>";
}
function kmlLineEnd() {
    "use strict";
    return "</coordinates></LineString>";
}
function kmlPolygonStart() {
    "use strict";
    return "<Polygon><outerBoundaryIs><LinearRing><coordinates>";
}
function kmlPolygonEnd() {
    "use strict";
    return "</coordinates></LinearRing></outerBoundaryIs></Polygon>";
}
function kmlStyleThickLine() {
    "use strict";
    return "<Style id=\"thickLine\"><LineStyle><width>2.5</width></LineStyle></Style>\n";
}
function kmlStyleTransparent50Poly() {
    "use strict";
    return "<Style id=\"transparent50Poly\"><PolyStyle><color>7fffffff</color></PolyStyle></Style>\n";
}
function kmlStyleUrl(style) {
    "use strict";
    return "<styleUrl>#" + style + "</styleUrl>";
}
//#endregion
//#region GPX support
function gpxStart(name) {
    "use strict";
    return "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"no\" ?>\n" +
        "<gpx xmlns=\"http://www.topografix.com/GPX/1/1\" xmlns:gpxx=\"http://www.garmin.com/xmlschemas/GpxExtensions/v3\" " +
        "xmlns:gpxtpx=\"http://www.garmin.com/xmlschemas/TrackPointExtension/v1\" creator=\"Doogal.co.uk\" " +
        "version=\"1.1\" xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\" " +
        "xsi:schemaLocation=\"http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd " +
        "http://www.garmin.com/xmlschemas/GpxExtensions/v3 http://www.garmin.com/xmlschemas/GpxExtensionsv3.xsd " +
        "http://www.garmin.com/xmlschemas/TrackPointExtension/v1 http://www.garmin.com/xmlschemas/TrackPointExtensionv1.xsd\">\n" +
        "<metadata>\n" + "<link href=\"http://www.doogal.co.uk\">\n<text>Doogal.co.uk</text>\n</link>\n" +
        "<time>" + new Date().toISOString() + "</time>\n" + "</metadata>\n" + "<trk>\n" + "<name>" + name + "</name>\n" + "<trkseg>\n";
}
function gpxPoint(location, elevation) {
    "use strict";
    if (elevation === void 0) { elevation = null; }
    var pt = "<trkpt lat=\"" + roundNumber(location.lat(), 6) + "\" lon=\"" +
        roundNumber(location.lng(), 6) + "\">\n";
    if (elevation != null) {
        pt += "<ele>" + roundNumber(elevation, 1) + "</ele>\n";
    }
    pt += "</trkpt>\n";
    return pt;
}
function gpxEnd() {
    "use strict";
    return "</trkseg>\n</trk>\n</gpx>\n";
}
//#endregion
//#region common mapping functions
var googleMapsLoaded = false;
function loadGoogleMaps(libraries, callback, language) {
    "use strict";
    if (language === void 0) { language = null; }
    if (googleMapsLoaded) {
        callback();
        return;
    }
    window.initGM = function () {
        googleMapsLoaded = true;
        callback();
    };
    var script = document.createElement("script");
    script.type = "text/javascript";
    var url = "https://maps.google.com/maps/api/js?key=AIzaSyCf8BXTO0etZNNq5xlAUgXShsHL7Y8MJi8&callback=initGM";
    if (libraries != null && libraries !== "") {
        url += "&libraries=" + libraries;
    }
    if (language != null) {
        url += "&language=" + language;
    }
    script.src = url;
    document.body.appendChild(script);
}
function geocodePostcode(postcode, response) {
    "use strict";
    $.ajax({
        url: "GetPostcode.ashx?postcode=" + postcode,
        success: function (data) {
            var splitData = data.split("\t");
            if (splitData.length > 2 && !isNaN(parseFloat(splitData[1])) && !isNaN(parseFloat(splitData[2]))) {
                var latLng = new google.maps.LatLng(parseFloat(splitData[1]), parseFloat(splitData[2]));
                // get quality returned from GetPostcode.ashx
                var quality = "";
                if (splitData.length > 3) {
                    quality = splitData[3].trim();
                }
                var constituency = "";
                var district = "";
                var ward = "";
                var lsoa = "";
                if (splitData.length > 4) {
                    constituency = splitData[4].trim();
                    district = splitData[5].trim();
                    ward = splitData[6].trim();
                    lsoa = splitData[7].trim();
                }
                response(latLng, quality, constituency, district, ward, lsoa);
            }
            else {
                response(null, null, null, null, null, null);
            }
        }
    });
}
function geocodeAddress(address, response) {
  "use strict";
  var geocoder = new google.maps.Geocoder();
  geocoder.geocode({ address: address }, function (results, status) {
    if (status === google.maps.GeocoderStatus.OVER_QUERY_LIMIT) {
      setTimeout(function () { geocodeAddress(address, response); }, 500);
    }
    else if (results && results[0]) {
      response(results[0].geometry.location);
    }
    else {
      response(null);
    }
  });
}
// extension to Google Maps API
function getPolygonLength(poly) {
    "use strict";
    var part = poly.getPath();
    var dist = 0;
    var len = part.getLength();
    for (var i = 0; i < len - 1; i++) {
        dist += google.maps.geometry.spherical.computeDistanceBetween(part.getAt(i), part.getAt(i + 1));
    }
    dist += google.maps.geometry.spherical.computeDistanceBetween(part.getAt(0), part.getAt(len - 1));
    return dist;
}
;
function getPolylineLength(poly) {
    "use strict";
    var a = poly.getPath(), len = a.getLength(), dist = 0;
    for (var i = 0; i < len - 1; i++) {
        dist += google.maps.geometry.spherical.computeDistanceBetween(a.getAt(i), a.getAt(i + 1));
    }
    return dist;
}
;
function getBounds(polyline) {
    "use strict";
    var bounds = new google.maps.LatLngBounds();
    polyline.getPath().forEach(function (e) {
        bounds.extend(e);
    });
    return bounds;
}
;
function distanceTo(from, a) {
    "use strict";
    var ra = Math.PI / 180;
    var b = from.lat() * ra, c = a.lat() * ra, d = b - c;
    var g = from.lng() * ra - a.lng() * ra;
    var f = 2 * Math.asin(Math.sqrt(Math.pow(Math.sin(d / 2), 2) + Math.cos(b) * Math.cos(c) * Math.pow(Math.sin(g / 2), 2)));
    return f * 6378137;
}
function GetElevation(lat, long, selector) {
    "use strict";
    getElevation(lat, long, function (elev) {
        if (elev == null) {
            $(selector).html("Not found");
        }
        else {
            var elevFeet = metresToFeet(elev);
            $(selector).html(Math.round(elev) + " metres (" + Math.round(elevFeet) + " feet)");
        }
    });
}
function getElevation(lat, long, callback) {
    "use strict";
    var elevator = new google.maps.ElevationService();
    var locations = [];
    // retrieve the clicked location and push it on the array
    locations.push(new google.maps.LatLng(lat, long));
    // create a LocationElevationRequest object using the array's one value
    var positionalRequest = {
        locations: locations
    };
    // initiate the location request
    elevator.getElevationForLocations(positionalRequest, function (results, status) {
        if (status === google.maps.ElevationStatus.OK) {
            // retrieve the first result
            if (results[0]) {
                callback(results[0].elevation);
            }
            else {
                callback(null);
            }
        }
        else {
            callback(null);
        }
    });
}
function reverseGeocode(latLng, callback) {
    "use strict";
    var geocoder = new google.maps.Geocoder();
    geocoder.geocode({ location: latLng, address: null }, function (results, status) {
        if (status === google.maps.GeocoderStatus.OK) {
            if (results) {
                var foundAddress = false;
                for (var i = 0; i < results.length; i++) {
                    if ((results[i].types[0] === "street_address") || (results[i].types[0] === "route")) {
                        callback(results[i].formatted_address);
                        foundAddress = true;
                        break;
                    }
                }
                if (!foundAddress) {
                    callback(results[0].formatted_address);
                }
            }
        }
    });
}
function ReverseGeocode(lat, long, selector) {
    "use strict";
    var latLong = new google.maps.LatLng(lat, long);
    reverseGeocode(latLong, function (address) {
        $(selector).html(address);
        $(selector).val(address);
    });
}
function getDirectionStatusText(status) {
    "use strict";
    switch (status) {
        case google.maps.DirectionsStatus.INVALID_REQUEST:
            return "Invalid request";
        case google.maps.DirectionsStatus.MAX_WAYPOINTS_EXCEEDED:
            return "Maximum waypoints exceeded";
        case google.maps.DirectionsStatus.NOT_FOUND:
            return "Not found";
        case google.maps.DirectionsStatus.OVER_QUERY_LIMIT:
            return "Over query limit";
        case google.maps.DirectionsStatus.REQUEST_DENIED:
            return "Request denied";
        case google.maps.DirectionsStatus.UNKNOWN_ERROR:
            return "Unknown error";
        case google.maps.DirectionsStatus.ZERO_RESULTS:
            return "Zero results";
        default:
            return status.toString();
    }
}
function getKmlErrorMsg(status) {
    "use strict";
    switch (status) {
        case google.maps.KmlLayerStatus.DOCUMENT_TOO_LARGE:
            return "The file is too large to display";
        case google.maps.KmlLayerStatus.INVALID_REQUEST:
            return "Invalid request";
        case google.maps.KmlLayerStatus.INVALID_DOCUMENT:
            return "The file is not a valid KML, KMZ or GeoRSS file";
        case google.maps.KmlLayerStatus.DOCUMENT_NOT_FOUND:
            return "The requested file does not exist";
        case google.maps.KmlLayerStatus.FETCH_ERROR:
            return "The document could not be fetched";
        default:
            return status.toString();
    }
}
function getAddressComponent(result, component) {
    "use strict";
    for (var i = 0; i < result.address_components.length; i++) {
        var comp = result.address_components[i];
        for (var j = 0; j < comp.types.length; j++) {
            if (comp.types[j] === component) {
                return comp.long_name;
            }
        }
    }
    return "";
}
function buildAddress(result, separator) {
    "use strict";
    return getAddressComponent(result, "street_number") + separator +
        getAddressComponent(result, "route") + separator +
        getAddressComponent(result, "locality") + separator +
        getAddressComponent(result, "postal_town") + separator +
        getAddressComponent(result, "administrative_area_level_3") + separator +
        getAddressComponent(result, "administrative_area_level_2") + separator +
        getAddressComponent(result, "administrative_area_level_1") + separator +
        getAddressComponent(result, "postal_code") + separator +
        getAddressComponent(result, "country");
}
function getPlaceDetails(map, reference, callback) {
    "use strict";
    var request = { reference: reference };
    var service = new google.maps.places.PlacesService(map);
    service.getDetails(request, function (place, status) {
        var html = "";
        if (status === google.maps.places.PlacesServiceStatus.OK) {
            // display information about place
            html += "<table>";
            html += "<tr><td><b>Name</b></td><td>" + place.name + "</td></tr>";
            html += "<tr><td><b>Address</b></td><td>" + place.formatted_address + "</td></tr>";
            if (place.formatted_phone_number != null) {
                html += "<tr><td><b>Phone</b></td><td>" + place.formatted_phone_number + "</td></tr>";
            }
            if (place.website != null) {
                html += "<tr><td><b>Website</b></td><td><a href=\"" + place.website + "\" target=\"_blank\">" +
                    place.website + "</a></td></tr>";
            }
            if (place.rating != null) {
                html += "<tr><td><b>Rating</b></td><td>" + place.rating + "</td></tr>";
            }
            html += "</table>";
        }
        else {
            html = "Error - " + status;
        }
        callback(html);
    });
}
//#endregion
//#region conversion functions
function metresToFeet(val) {
    "use strict";
    return val * 3.2808399;
}
function feetToMetres(val) {
    "use strict";
    return val / 3.2808399;
}
function kmToMiles(val) {
    "use strict";
    return val * 0.621371192;
}
function milesToKMs(val) {
    "use strict";
    return val / 0.621371192;
}
function distanceUnitName(showImperial) {
    "use strict";
    if (showImperial) {
        return " miles";
    }
    else {
        return " km";
    }
}
function elevationUnits(showImperial) {
    "use strict";
    if (showImperial) {
        return " feet";
    }
    else {
        return " metres";
    }
}
function showDistance(distanceM) {
    "use strict";
    return roundNumber(distanceM / 1000, 1) + " km (" + roundNumber(kmToMiles(distanceM / 1000), 1) + " miles)";
}
function showElevation(elevationM) {
    "use strict";
    return addCommas(roundNumber(elevationM, 0)) + " metres (" + addCommas(roundNumber(metresToFeet(elevationM), 0)) + " feet)";
}
//#endregion
//#region Strava
// define our result classes
var SegmentMap = (function () {
    function SegmentMap() {
    }
    return SegmentMap;
}());
var SegmentElevation = (function () {
    function SegmentElevation() {
    }
    return SegmentElevation;
}());
var SegmentDetail = (function () {
    function SegmentDetail() {
    }
    return SegmentDetail;
}());
function getClimbTotalAscent(elevations) {
    "use strict";
    var ascent = 0;
    for (var i = 0; i < elevations.length; i++) {
        if (i > 0) {
            var thisAscent = elevations[i] - elevations[i - 1];
            if (thisAscent > 0) {
                ascent += thisAscent;
            }
        }
    }
    return ascent;
}
function getClimbGrade(climbInMetres, segmentDistanceInMetres) {
    "use strict";
    return 100 * climbInMetres / segmentDistanceInMetres;
}
function getClimbScore(climbInMetres, segmentDistanceInMetres) {
    "use strict";
    var grade = getClimbGrade(climbInMetres, segmentDistanceInMetres);
    return segmentDistanceInMetres * grade;
}
function getClimbCategory(climbInMetres, segmentDistanceInMetres) {
    "use strict";
    var grade = getClimbGrade(climbInMetres, segmentDistanceInMetres);
    // calculate the category
    var score = getClimbScore(climbInMetres, segmentDistanceInMetres);
    var climbCategory = "?";
    if (score < 8000) {
        climbCategory = "NC";
    }
    else if (grade < 3) {
        climbCategory = "NC";
    }
    else {
        if (score >= 8000) {
            climbCategory = "4";
        }
        if (score >= 16000) {
            climbCategory = "3";
        }
        if (score >= 32000) {
            climbCategory = "2";
        }
        if (score >= 64000) {
            climbCategory = "1";
        }
        if (score >= 80000) {
            climbCategory = "HC";
        }
    }
    return climbCategory;
}
function getClimbCategoryDescription(climbCategory) {
    "use strict";
    switch (climbCategory) {
        case 0:
            return "NC";
        case 1:
            return "4";
        case 2:
            return "3";
        case 3:
            return "2";
        case 4:
            return "1";
        case 5:
            return "HC";
        default:
            return "NC";
    }
}
function getDisplayName(detail) {
    "use strict";
    if (detail.name == null) {
        return "(no name)";
    }
    return detail.name;
}
function polylineColor(detail, isSelected) {
    "use strict";
    if (isSelected) {
        return "Green";
    }
    if (detail.athlete_count < 0) {
        return "Gray";
    }
    return "Red";
}
function polylineWidth(detail) {
    "use strict";
    if (detail.athlete_count < 0) {
        return 2;
    }
    if (detail.athlete_count < 10) {
        return 1;
    }
    return Math.floor(detail.athlete_count.toString().length - 1);
}
function setInfowindowContent(infowindow, detail) {
    "use strict";
    var name = getDisplayName(detail);
    var distance = detail.distance;
    var averageGrade = detail.average_grade;
    var elevationDifference = detail.elevation_high - detail.elevation_low;
    var climbCategory = detail.climb_category;
    var id = detail.id;
    var distanceString = showDistance(distance);
    var content = "<div class=\"segment-details\"><h5>" + name + "</h5>" +
        "<div><table class=\"strava-segment-table\">" +
        "<tr><td><b>Distance</b></td><td>" + distanceString + "</td></tr>";
    content += "<tr><td><b>Average grade</b></td><td>" + averageGrade + " %</td></tr>";
    if (detail.maximum_grade !== 0) {
        content += "<tr><td><b>Maximum grade</b></td><td>" + detail.maximum_grade + "%</td></tr>";
    }
    content += "<tr><td><b>Elevation difference</b></td><td>" + showElevation(elevationDifference) + "</td></tr>";
    content += "<tr><td><b>Total elevation gain</b></td><td>" + showElevation(detail.total_elevation_gain) +
        "</td></tr>";
    if (climbCategory > 0) {
        content += "<tr><td><b>Climb category</b></td><td>" + getClimbCategoryDescription(climbCategory) + "</td></tr>";
    }
    if (detail.kom_time != null) {
        content += "<tr><td><b>KOM time</b></td><td>" + toHHMMSS(detail.kom_time) + "</td></tr>";
    }
    // if (detail.kom_score != null) {
    //  content += "<tr><td><b>KOM score</b></td><td>" + detail.kom_score + "</td></tr>";
    // }
    if (detail.athlete_count > 0) {
        content += "<tr><td><b># Riders</b></td><td>" + addCommas(detail.athlete_count) + "</td></tr>";
    }
    if (detail.effort_count > 0) {
        content += "<tr><td><b># Tries</b></td><td>" + addCommas(detail.effort_count) + "</td></tr>";
    }
    if (detail.star_count > 0) {
        content += "<tr><td><b># Stars</b></td><td>" + addCommas(detail.star_count) + "</td></tr>";
    }
    content += "</table></div>";
    if (detail.elevation != null) {
        content += "<div class=\"elevation-chart\"></div>";
    }
    content += "<div>" + "<a target=\"_blank\" href=\"StravaSegment.php?id=" + id + "\">Details</a> | " +
        "<a target=\"_blank\" href=\"https://www.strava.com/segments/" + id + "\">View on Strava</a> | " +
        "<form id=\"strava-download-gpx\" action=\"download.ashx\" method=\"post\">" +
        "<input type=\"hidden\" name=\"fileName\" value=\"segment.gpx\" />" +
        "<textarea style=\"display:none;\" id=\"gpxData\" name=\"data\" spellcheck=\"false\"></textarea>" +
        "<a style=\"cursor:pointer;\" onclick=\"downloadGpx(" + id + ")\">GPX</a>" +
        "</form></div></div>";
    infowindow.setContent(content);
    // plot the chart
    if (detail.elevation != null && $(".elevation-chart").length > 0) {
        var elevData = [];
        for (var i = 0; i < detail.elevation.length; i++) {
            elevData.push([detail.elevation[i].d, detail.elevation[i].a]);
        }
        $.plot($(".elevation-chart"), [{ data: elevData, lines: { show: true, fill: true } }]);
    }
}
function toHHMMSS(sec_num) {
    "use strict";
    var hours = Math.floor(sec_num / 3600);
    var minutes = Math.floor((sec_num - (hours * 3600)) / 60);
    var seconds = sec_num - (hours * 3600) - (minutes * 60);
    var hoursString = hours.toString();
    if (hours < 10) {
        hoursString = "0" + hours;
    }
    var minutesString = minutes.toString();
    if (minutes < 10) {
        minutesString = "0" + minutes;
    }
    var secondsString = seconds.toString();
    if (seconds < 10) {
        secondsString = "0" + seconds;
    }
    var time = hoursString + ":" + minutesString + ":" + secondsString;
    return time;
}
function downloadGpx(id) {
    "use strict";
    $.ajax("StravaSegmentDetail.ashx?id=" + id, {
        cache: false,
        success: function (data) {
            // build the GPX
            var gpx = gpxStart(data.name);
            for (var i = 0; i < data.elevation.length; i++) {
                var pt = data.elevation[i];
                var ll = new google.maps.LatLng(pt.l[0], pt.l[1]);
                gpx += gpxPoint(ll, pt.a);
            }
            gpx += gpxEnd();
            $("#gpxData").val(gpx);
            $("#strava-download-gpx").submit();
        },
        error: function (jqXhr, textStatus, errorThrown) {
            alert("Error - " + errorThrown);
        }
    });
}
//#endregion
//#region load functions
function moveScroller() {
    "use strict";
    var $anchor = $("#scroller-anchor");
    var $scroller = $("#CriteoAdLeft");
    if ($scroller.length > 0) {
        var move = function () {
            var st = $(window).scrollTop();
            var ot = $anchor.offset().top;
            if (st > ot) {
                $scroller.css({
                    position: "fixed",
                    top: "0"
                });
            }
            else {
                if (st <= ot) {
                    $scroller.css({
                        position: "relative",
                        top: ""
                    });
                }
            }
        };
        $(window).scroll(move);
        move();
    }
}
$(function () {
    moveScroller();
});
var disqus_identifier = window.location.url;
var ds_loaded = false;
function loadDisqus() {
    "use strict";
    var disqus_div = $("#disqus_thread"); // the ID of the Disqus DIV tag
    var top = disqus_div.offset().top;
    if (!ds_loaded && $(window).scrollTop() + $(window).height() > top) {
        reallyLoadDisqus();
    }
}
function reallyLoadDisqus() {
    "use strict";
    var disqus_div = $("#disqus_thread"); // the ID of the Disqus DIV tag
    var disqus_data = disqus_div.data();
    ds_loaded = true;
    for (var key in disqus_data) {
        if (key.substr(0, 6) === "disqus") {
            window["disqus_" + key.replace("disqus", "").toLowerCase()] = disqus_data[key];
        }
    }
    var d = document, s = d.createElement("script");
    s.src = "//doogal.disqus.com/embed.js";
    s.setAttribute("data-timestamp", new Date().toString());
    (d.head || d.body).appendChild(s);
}
$(document).ready(function () {
    cookieChoices.showCookieConsentBar("This site uses cookies", "close message", "learn more", "cookies.php");
});
//#endregion
//#region other functions
function getParameterByName(name) {
    "use strict";
    var url = window.location.href;
    name = name.replace(/[\[\]]/g, "\\$&");
    var regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"), results = regex.exec(url);
    if (!results) {
        return null;
    }
    if (!results[2]) {
        return "";
    }
    return decodeURIComponent(results[2].replace(/\+/g, " "));
}
function repeat(chr, count) {
    "use strict";
    var str = "";
    for (var x = 0; x < count; x++) {
        str += chr;
    }
    return str;
}
;
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
function roundNumber(num, dec) {
    "use strict";
    return Math.round(num * Math.pow(10, dec)) / Math.pow(10, dec);
}
// indexOf method if it doesn't exist
if (!Array.prototype.indexOf) {
    Array.prototype.indexOf = function (elt, from) {
        if (from === void 0) { from = 0; }
        var len = this.length;
        from = (from < 0) ? Math.ceil(from) : Math.floor(from);
        if (from < 0) {
            from += len;
        }
        for (; from < len; from++) {
            if (from in this && this[from] === elt) {
                return from;
            }
        }
        return -1;
    };
}
function addCommas(n) {
    "use strict";
    var nStr = n.toString();
    var x = nStr.split(".");
    var x1 = x[0];
    var x2 = x.length > 1 ? "." + x[1] : "";
    var rgx = /(\d+)(\d{3})/;
    while (rgx.test(x1)) {
        x1 = x1.replace(rgx, "$1,$2");
    }
    return x1 + x2;
}
function XmlEncode(text) {
    "use strict";
    text = text.replace(/&/g, "&amp;");
    text = text.replace(/\"/g, "&quot;");
    text = text.replace(/\'/g, "&apos;");
    text = text.replace(/</g, "&lt;");
    text = text.replace(/>/g, "&gt;");
    return text;
}
function getWhat3Words(latLong, callback) {
    "use strict";
    $.get("https://api.what3words.com/v2/reverse?key=0HZ96SU9&coords=" + latLong.lat() + "," + latLong.lng(), function (response) {
        callback(response.words);
    });
}
if (!Date.prototype.toISOString) {
    (function () {
        function pad(number) {
            var r = String(number);
            if (r.length === 1) {
                r = "0" + r;
            }
            return r;
        }
        Date.prototype.toISOString = function () {
            return this.getUTCFullYear() + "-" + pad(this.getUTCMonth() + 1) + "-" + pad(this.getUTCDate()) + "T" +
                pad(this.getUTCHours()) + ":" + pad(this.getUTCMinutes()) + ":" + pad(this.getUTCSeconds()) + "." +
                String((this.getUTCMilliseconds() / 1000).toFixed(3)).slice(2, 5) + "Z";
        };
    }());
}
var lastPos = null;
function geolocateUser(successCallback, errorCallback) {
    "use strict";
    var geoTimeout = 10000;
    var timeOuthandler = setTimeout(function () { errorCallback(); }, geoTimeout);
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function (position) {
            clearTimeout(timeOuthandler);
            lastPos = position;
            successCallback(position);
        }, function () {
            // something went wrong
            clearTimeout(timeOuthandler);
            if (lastPos == null) {
                errorCallback();
            }
            else {
                successCallback(lastPos);
            }
        }, { timeout: geoTimeout });
    }
    else {
        errorCallback();
    }
}
//#endregion
//#region sorttable
var stIsIE = false;
var _timer;
var sorttable = {
    DATE_RE: /^(\d\d?)[\/\.-](\d\d?)[\/\.-]((\d\d)?\d\d)$/,
    done: false,
    init: function () {
        // quit if this function has already been called
        if (this.done) {
            return;
        }
        // flag this function so we don't do the same thing twice
        this.done = true;
        // kill the timer
        if (_timer) {
            clearInterval(_timer);
        }
        var tables = document.getElementsByTagName("table");
        for (var i = 0; i < tables.length; i++) {
            if (tables[i].className.search(/\bsortable\b/) !== -1) {
                sorttable.makeSortable(tables[i]);
            }
        }
    },
    makeSortable: function (table) {
        if (table.getElementsByTagName("thead").length === 0) {
            // table doesn't have a tHead. Since it should have, create one and
            // put the first table row in it.
            var the = document.createElement("thead");
            the.appendChild(table.rows[0]);
            table.insertBefore(the, table.firstChild);
        }
        // safari doesn't support table.tHead, sigh
        if (table.tHead == null) {
            table.tHead = table.getElementsByTagName("thead")[0];
        }
        if (table.tHead.rows.length !== 1) {
            return; // can't cope with two header rows
        }
        // work through each column and calculate its type
        var headrow = (table.tHead.rows[0]).cells;
        for (var i = 0; i < headrow.length; i++) {
            // manually override the type with a sorttable_type attribute
            if (!headrow[i].className.match(/\bsorttable_nosort\b/)) {
                var override = "";
                var mtch = headrow[i].className.match(/\bsorttable_([a-z0-9]+)\b/);
                if (mtch) {
                    override = mtch[1];
                }
                if (mtch && typeof sorttable["sort_" + override] === "function") {
                    (headrow[i]).sorttable_sortfunction = sorttable["sort_" + override];
                }
                else {
                    (headrow[i]).sorttable_sortfunction = sorttable.guessType(table, i);
                }
                // make it clickable to sort
                (headrow[i]).sorttable_columnindex = i;
                (headrow[i]).sorttable_tbody = table.tBodies[0];
                dean_addEvent(headrow[i], "click", sorttable.innerSortFunction);
            }
        }
    },
    innerSortFunction: function () {
        if (this.className.search(/\bsorttable_sorted\b/) !== -1) {
            // if we're already sorted by this column, just
            // reverse the table, which is quicker
            sorttable.reverse(this.sorttable_tbody);
            this.className = this.className.replace("sorttable_sorted", "sorttable_sorted_reverse");
            this.removeChild(document.getElementById("sorttable_sortfwdind"));
            var sortrevind = document.createElement("span");
            sortrevind.id = "sorttable_sortrevind";
            sortrevind.innerHTML = stIsIE ? "&nbsp<font face=\"webdings\">5</font>" : "&nbsp;&#x25B4;";
            this.appendChild(sortrevind);
            return;
        }
        if (this.className.search(/\bsorttable_sorted_reverse\b/) !== -1) {
            // if we're already sorted by this column in reverse, just
            // re-reverse the table, which is quicker
            sorttable.reverse(this.sorttable_tbody);
            this.className = this.className.replace("sorttable_sorted_reverse", "sorttable_sorted");
            this.removeChild(document.getElementById("sorttable_sortrevind"));
            var sortfwdind = document.createElement("span");
            sortfwdind.id = "sorttable_sortfwdind";
            sortfwdind.innerHTML = stIsIE ? "&nbsp<font face=\"webdings\">6</font>" : "&nbsp;&#x25BE;";
            this.appendChild(sortfwdind);
            return;
        }
        // remove sorttable_sorted classes
        var theadrow = this.parentNode;
        for (var i = 0; i < theadrow.childNodes.length; i++) {
            var cell = theadrow.childNodes[i];
            if (cell.nodeType === 1) {
                cell.className = cell.className.replace("sorttable_sorted_reverse", "");
                cell.className = cell.className.replace("sorttable_sorted", "");
            }
        }
        sortfwdind = document.getElementById("sorttable_sortfwdind");
        if (sortfwdind) {
            sortfwdind.parentNode.removeChild(sortfwdind);
        }
        sortrevind = document.getElementById("sorttable_sortrevind");
        if (sortrevind) {
            sortrevind.parentNode.removeChild(sortrevind);
        }
        this.className += " sorttable_sorted";
        sortfwdind = document.createElement("span");
        sortfwdind.id = "sorttable_sortfwdind";
        sortfwdind.innerHTML = stIsIE ? "&nbsp<font face=\"webdings\">6</font>" : "&nbsp;&#x25BE;";
        this.appendChild(sortfwdind);
        // build an array to sort. This is a Schwartzian transform thing,
        // i.e., we "decorate" each row with the actual sort key,
        // sort based on the sort keys, and then put the rows back in order
        // which is a lot faster because you only do getInnerText once per row
        var rowArray = [];
        var col = this.sorttable_columnindex;
        var rows = this.sorttable_tbody.rows;
        for (var j = 0; j < rows.length; j++) {
            rowArray[rowArray.length] = [sorttable.getInnerText(rows[j].cells[col]), rows[j]];
        }
        rowArray.sort(this.sorttable_sortfunction);
        var tb = this.sorttable_tbody;
        for (var j = 0; j < rowArray.length; j++) {
            tb.appendChild(rowArray[j][1]);
        }
        delete rowArray;
    },
    guessType: function (table, column) {
        // guess the type of a column based on its first non-blank row
        var sortfn = sorttable.sort_alpha;
        for (var i = 0; i < table.tBodies[0].rows.length; i++) {
            var text = sorttable.getInnerText(table.tBodies[0].rows[i].cells[column]);
            if (text !== "") {
                if (text.match(/^-?[£$¤]?[\d,.]+%?$/)) {
                    return sorttable.sort_numeric;
                }
                // check for a date: dd/mm/yyyy or dd/mm/yy
                // can have / or . or - as separator
                // can be mm/dd as well
                var possdate = text.match(sorttable.DATE_RE);
                if (possdate) {
                    // looks like a date
                    var first = parseInt(possdate[1], 10);
                    var second = parseInt(possdate[2], 10);
                    if (first > 12) {
                        // definitely dd/mm
                        return sorttable.sort_ddmm;
                    }
                    else if (second > 12) {
                        return sorttable.sort_mmdd;
                    }
                    else {
                        // looks like a date, but we can't tell which, so assume
                        // that it's dd/mm (English imperialism!) and keep looking
                        sortfn = sorttable.sort_ddmm;
                    }
                }
            }
        }
        return sortfn;
    },
    getInnerText: function (node) {
        // gets the text we want to use for sorting for a cell.
        // strips leading and trailing whitespace.
        // this is *not* a generic getInnerText function; it's special to sorttable.
        // for example, you can override the cell text with a customkey attribute.
        // it also gets .value for <input> fields.
        if (!node) {
            return "";
        }
        var hasInputs = (typeof node.getElementsByTagName === "function") &&
            node.getElementsByTagName("input").length;
        if (node.getAttribute("sorttable_customkey") != null) {
            return node.getAttribute("sorttable_customkey");
        }
        else if (typeof node.textContent !== "undefined" && !hasInputs) {
            return node.textContent.replace(/^\s+|\s+$/g, "");
        }
        else if (typeof node.innerText !== "undefined" && !hasInputs) {
            return node.innerText.replace(/^\s+|\s+$/g, "");
        }
        else if (typeof node.text !== "undefined" && !hasInputs) {
            return node.text.replace(/^\s+|\s+$/g, "");
        }
        else {
            switch (node.nodeType) {
                case 3:
                    if (node.nodeName.toLowerCase() === "input") {
                        return node.value.replace(/^\s+|\s+$/g, "");
                    }
                case 4:
                    return node.nodeValue.replace(/^\s+|\s+$/g, "");
                case 1:
                case 11:
                    var innerText = "";
                    for (var i = 0; i < node.childNodes.length; i++) {
                        innerText += sorttable.getInnerText(node.childNodes[i]);
                    }
                    return innerText.replace(/^\s+|\s+$/g, "");
                default:
                    return "";
            }
        }
    },
    reverse: function (tbody) {
        // reverse the rows in a tbody
        var newrows = [];
        for (var i = 0; i < tbody.rows.length; i++) {
            newrows[newrows.length] = tbody.rows[i];
        }
        for (var i = newrows.length - 1; i >= 0; i--) {
            tbody.appendChild(newrows[i]);
        }
        delete newrows;
    },
    /* sort functions
       each sort function takes two parameters, a and b
       you are comparing a[0] and b[0] */
    sort_numeric: function (a, b) {
        var aa = parseFloat(a[0].replace(/[^0-9.-]/g, ""));
        if (isNaN(aa)) {
            aa = 0;
        }
        var bb = parseFloat(b[0].replace(/[^0-9.-]/g, ""));
        if (isNaN(bb)) {
            bb = 0;
        }
        return aa - bb;
    },
    sort_alpha: function (a, b) {
        if (a[0] === b[0]) {
            return 0;
        }
        if (a[0] < b[0]) {
            return -1;
        }
        return 1;
    },
    sort_ddmm: function (a, b) {
        var mtch = a[0].match(sorttable.DATE_RE);
        var y = mtch[3];
        var m = mtch[2];
        var d = mtch[1];
        if (m.length === 1) {
            m = "0" + m;
        }
        if (d.length === 1) {
            d = "0" + d;
        }
        var dt1 = y + m + d;
        mtch = b[0].match(sorttable.DATE_RE);
        y = mtch[3];
        m = mtch[2];
        d = mtch[1];
        if (m.length === 1) {
            m = "0" + m;
        }
        if (d.length === 1) {
            d = "0" + d;
        }
        var dt2 = y + m + d;
        if (dt1 === dt2) {
            return 0;
        }
        if (dt1 < dt2) {
            return -1;
        }
        return 1;
    },
    sort_mmdd: function (a, b) {
        var mtch = a[0].match(sorttable.DATE_RE);
        var y = mtch[3];
        var d = mtch[2];
        var m = mtch[1];
        if (m.length === 1) {
            m = "0" + m;
        }
        if (d.length === 1) {
            d = "0" + d;
        }
        var dt1 = y + m + d;
        mtch = b[0].match(sorttable.DATE_RE);
        y = mtch[3];
        d = mtch[2];
        m = mtch[1];
        if (m.length === 1) {
            m = "0" + m;
        }
        if (d.length === 1) {
            d = "0" + d;
        }
        var dt2 = y + m + d;
        if (dt1 === dt2) {
            return 0;
        }
        if (dt1 < dt2) {
            return -1;
        }
        return 1;
    }
};
/* ******************************************************************
   Supporting functions: bundled here to avoid depending on a library
   ****************************************************************** */
/* for Mozilla/Opera9 */
if (document.addEventListener) {
    document.addEventListener("DOMContentLoaded", sorttable.init, false);
}
/* for Internet Explorer */
/*@cc_on @*/
/*@if (@_win32)
    document.write("<script id=__ie_onload defer src=javascript:void(0)><\/script>");
    var script = document.getElementById("__ie_onload");
    script.onreadystatechange = function() {
        if (this.readyState == "complete") {
            sorttable.init(); // call the onload handler
        }
    };
/*@end @*/
/* for Safari */
if (/WebKit/i.test(navigator.userAgent)) {
    _timer = setInterval(function () {
        if (/loaded|complete/.test(document.readyState)) {
            sorttable.init(); // call the onload handler
        }
    }, 10);
}
/* for other browsers */
window.onload = sorttable.init;
// written by Dean Edwards, 2005
// with input from Tino Zijdel, Matthias Miller, Diego Perini
// a counter used to create unique IDs
var guid = 1;
function dean_addEvent(element, type, handler) {
    "use strict";
    if (element.addEventListener) {
        element.addEventListener(type, handler, false);
    }
    else {
        // assign each event handler a unique ID
        if (!handler.$$guid) {
            handler.$$guid = guid++;
        }
        // create a hash table of event types for the element
        if (!element.events) {
            element.events = {};
        }
        // create a hash table of event handlers for each element/event pair
        var handlers = element.events[type];
        if (!handlers) {
            handlers = element.events[type] = {};
            // store the existing event handler (if there is one)
            if (element["on" + type]) {
                handlers[0] = element["on" + type];
            }
        }
        // store the event handler in the hash table
        handlers[handler.$$guid] = handler;
        // assign a global event handler to do all the work
        element["on" + type] = handleEvent;
    }
}
;
function removeEvent(element, type, handler) {
    "use strict";
    if (element.removeEventListener) {
        element.removeEventListener(type, handler, false);
    }
    else {
        // delete the event handler from the hash table
        if (element.events && element.events[type]) {
            delete element.events[type][handler.$$guid];
        }
    }
}
;
function handleEvent(event) {
    "use strict";
    var returnValue = true;
    // grab the event object (IE uses a global event object)
    event = event || fixEvent(((this.ownerDocument || this.document || this).parentWindow || window).event);
    // get a reference to the hash table of event handlers
    var handlers = this.events[event.type];
    // execute each event handler
    for (var i in handlers) {
        if (handlers.hasOwnProperty(i)) {
            this.$$handleEvent = handlers[i];
            if (this.$$handleEvent(event) === false) {
                returnValue = false;
            }
        }
    }
    return returnValue;
}
;
function fixEvent(event) {
    "use strict";
    // add W3C standard event methods
    event.preventDefault = function () {
        this.returnValue = false;
    };
    event.stopPropagation = function () {
        this.cancelBubble = true;
    };
    return event;
}
;
//#endregion
//#region error dialog
function createErrorDialog() {
    "use strict";
    $("<div class=\"modal fade\" id=\"myModal\" tabindex=\"-1\" role=\"dialog\" aria-labelledby=\"myModalLabel\" aria-hidden=\"true\">" +
        "<div class=\"modal-dialog\">" +
        "<div class=\"modal-content\">" +
        "<div class=\"modal-header\">" +
        "<button type=\"button\" class=\"close\" data-dismiss=\"modal\" aria-label=\"Close\">" +
        "<span aria-hidden=\"true\">&times;</span></button>" +
        "<h4 class=\"modal-title\" id=\"myModalLabel\">Error</h4>" +
        "</div>" +
        "<div class=\"modal-body\">" +
        "</div>" +
        "<div class=\"modal-footer\">" +
        "<button type=\"button\" class=\"btn btn-primary\" data-dismiss=\"modal\">Close</button>" +
        "</div>" +
        "</div>" +
        "</div>" +
        "</div>")
        .appendTo("body");
}
function showError(error) {
    "use strict";
    if ($("#myModal").length === 0) {
        createErrorDialog();
    }
    $("#myModal .modal-body").html(error);
    $("#myModal").modal();
}
//#endregion 
