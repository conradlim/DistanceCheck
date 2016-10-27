/// <reference path="../Scripts/typings/jquery/jquery.d.ts" />
/// <reference path="../typings/google.maps.d.ts" />
function printMapControl(map) {
    "use strict";
    if (!isCanvasSupported()) {
        return null;
    }
    var controlDiv = printMapButton("Print", "printMap");
    google.maps.event.addDomListener(controlDiv, "click", function () {
        printMap(map);
    });
    return controlDiv;
}
function isCanvasSupported() {
    "use strict";
    var elem = document.createElement("canvas");
    return !!(elem.getContext && elem.getContext("2d"));
}
function printMap(map) {
    "use strict";
    var mapControlVisible = map.mapTypeControl;
    var zoomVisible = map.zoomControl;
    var streetViewVisible = map.streetViewControl;
    var panVisible = map.panControl;
    map.setOptions({
        mapTypeControl: false,
        zoomControl: false,
        streetViewControl: false,
        panControl: false
    });
    map.controls.forEach(function (array) {
        array.forEach(function (elem) {
            $(elem).hide();
        });
    });
    var showControls = function () {
        map.setOptions({
            mapTypeControl: mapControlVisible,
            zoomControl: zoomVisible,
            streetViewControl: streetViewVisible,
            panControl: panVisible
        });
        map.controls.forEach(function (array) {
            array.forEach(function (elem) {
                $(elem).show();
            });
        });
    };
    var popUpAndPrint = function () {
        try {
            var dataUrl = [];
            var container = map.getDiv();
            $(container)
                .find("canvas")
                .filter(function () {
                dataUrl.push(this.toDataURL("image/png"));
            });
            var clone = $(container).clone();
            var width = container.clientWidth;
            var height = container.clientHeight;
            $(clone)
                .find("canvas")
                .each(function (i, item) {
                $(item)
                    .replaceWith($("<img>")
                    .attr("src", dataUrl[i]))
                    .css("position", "absolute")
                    .css("left", "0")
                    .css("top", "0")
                    .css("width", width + "px")
                    .css("height", height + "px");
            });
            var printWindow = window.open("", "PrintMap", "width=" + width + ",height=" + height);
            if (printWindow == null) {
                throw new Error("Unable to display the print dialog, you might need to allow popups on this site");
            }
            printWindow.document.writeln($(clone).html());
            printWindow.document.close();
            printWindow.focus();
            printWindow.print();
            printWindow.close();
        }
        catch (error) {
            alert(error.message);
        }
        finally {
            showControls();
        }
    };
    setTimeout(popUpAndPrint, 500);
}
function printMapButton(text, className) {
    "use strict";
    var controlDiv = document.createElement("div");
    controlDiv.className = className;
    controlDiv.index = 1;
    controlDiv.style.padding = "10px";
    // set CSS for the control border.
    var controlUi = document.createElement("div");
    controlUi.style.backgroundColor = "rgb(255, 255, 255)";
    controlUi.style.color = "#565656";
    controlUi.style.cursor = "pointer";
    controlUi.style.textAlign = "center";
    controlUi.style.boxShadow = "rgba(0, 0, 0, 0.298039) 0px 1px 4px -1px";
    controlDiv.appendChild(controlUi);
    // set CSS for the control interior.
    var controlText = document.createElement("div");
    controlText.style.fontFamily = "Roboto,Arial,sans-serif";
    controlText.style.fontSize = "11px";
    controlText.style.paddingTop = "8px";
    controlText.style.paddingBottom = "8px";
    controlText.style.paddingLeft = "8px";
    controlText.style.paddingRight = "8px";
    controlText.innerHTML = text;
    controlUi.appendChild(controlText);
    $(controlUi).on("mouseenter", function () {
        controlUi.style.backgroundColor = "rgb(235, 235, 235)";
        controlUi.style.color = "#000";
    });
    $(controlUi).on("mouseleave", function () {
        controlUi.style.backgroundColor = "rgb(255, 255, 255)";
        controlUi.style.color = "#565656";
    });
    return controlDiv;
}
