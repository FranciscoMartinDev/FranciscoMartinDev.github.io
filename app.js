let map;
let stops = [];
let directionsService;
let directionsRenderer;
let autocomplete;
let userLocationGlobal;
let nearestStopLocationGlobal;
let streetViewPanorama;

function initMap() {
    // Estilos del mapa para ocultar otros marcadores y puntos de interés
    const mapStyles = [
        {
            featureType: "poi",
            elementType: "labels",
            stylers: [{ visibility: "off" }]
        },
        {
            featureType: "transit",
            elementType: "labels",
            stylers: [{ visibility: "off" }]
        }
    ];

    map = new google.maps.Map(document.getElementById('map'), {
        center: { lat: 36.67726010874127, lng: -4.493653914698043 }, // Centro en el Aeropuerto de Málaga
        zoom: 12,
        styles: mapStyles
    });

    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer({
        map: map,
        suppressMarkers: true // Para suprimir los marcadores predeterminados
    });

    autocomplete = new google.maps.places.Autocomplete(document.getElementById('hotel-input'));
    autocomplete.bindTo('bounds', map);
    autocomplete.setFields(['geometry', 'name']);

    autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        if (!place.geometry || !place.geometry.location) {
            alert("Por favor, seleccione un lugar válido de la lista de sugerencias.");
            return;
        }

        const userLocation = place.geometry.location;
        userLocationGlobal = userLocation;
        findNearestStopAndDisplayRoute(userLocation.lat(), userLocation.lng());
    });

    // Cargar los datos de las paradas desde un archivo GEOJSON
    fetch('stops.geojson')
        .then(response => response.json())
        .then(data => {
            if (!data.features) {
                console.error("GeoJSON data is invalid or incorrectly formatted");
                return;
            }
            stops = data.features.map(feature => {
                const lat = parseFloat(feature.geometry.coordinates[1]);
                const lng = parseFloat(feature.geometry.coordinates[0]);
                const name = feature.properties.Name;
                return { lat, lng, name };
            });
            addMarkers();
        })
        .catch(error => console.error('Error loading the GEOJSON data:', error));
}

function addMarkers() {
    stops.forEach(stop => {
        const marker = new google.maps.Marker({
            position: { lat: stop.lat, lng: stop.lng },
            map: map,
            title: stop.name,
            icon: {
                url: 'bus.png', // URL de la imagen del icono del autobús dentro de un círculo blanco
                scaledSize: new google.maps.Size(30, 30) // Ajusta el tamaño del icono según sea necesario
            }
        });

        const infoWindow = new google.maps.InfoWindow({
            content: stop.name
        });

        marker.addListener('click', () => {
            infoWindow.open(map, marker);
        });
    });
}

function locateAndFindNearest() {
    const place = autocomplete.getPlace();
    if (!place.geometry || !place.geometry.location) {
        alert("Por favor, seleccione un lugar válido de la lista de sugerencias.");
        return;
    }

    const userLocation = place.geometry.location;
    userLocationGlobal = userLocation;
    findNearestStopAndDisplayRoute(userLocation.lat(), userLocation.lng());
}

function findNearestStopAndDisplayRoute(lat, lng) {
    if (stops.length === 0) {
        console.error("No stops data available.");
        alert("No stops data available.");
        return;
    }

    const userLocation = new google.maps.LatLng(lat, lng);
    const batchSize = 25;
    let shortestDistance = Infinity;
    let nearestStop = null;

    const calculateDistances = (batch, index) => {
        return new Promise((resolve, reject) => {
            let service = new google.maps.DistanceMatrixService();
            service.getDistanceMatrix({
                origins: [userLocation],
                destinations: batch.map(stop => new google.maps.LatLng(stop.lat, stop.lng)),
                travelMode: 'WALKING',
                unitSystem: google.maps.UnitSystem.METRIC,
            }, (response, status) => {
                if (status === 'OK') {
                    response.rows[0].elements.forEach((result, idx) => {
                        if (result.distance && result.distance.value < shortestDistance) {
                            shortestDistance = result.distance.value;
                            nearestStop = batch[idx];
                        }
                    });
                    resolve();
                } else {
                    reject(status);
                }
            });
        });
    };

    const processBatches = async () => {
        try {
            for (let i = 0; i < stops.length; i += batchSize) {
                const batch = stops.slice(i, i + batchSize);
                await calculateDistances(batch, i / batchSize);
            }
            if (nearestStop) {
                const nearestStopLocation = new google.maps.LatLng(nearestStop.lat, nearestStop.lng);
                nearestStopLocationGlobal = nearestStopLocation;
                displayRoute(userLocation, nearestStopLocation, nearestStop.name);
            } else {
                console.error('No nearest stop found.');
                alert('No nearest stop found.');
            }
        } catch (error) {
            console.error('Distance Matrix request failed due to ', error);
            alert('Distance Matrix request failed due to ' + error);
        }
    };

    processBatches();
}

function displayRoute(userLocation, stopLocation, stopName) {
    directionsService.route({
        origin: userLocation,
        destination: stopLocation,
        travelMode: google.maps.TravelMode.WALKING
    }, (response, status) => {
        if (status === 'OK') {
            directionsRenderer.setDirections(response);

            const leg = response.routes[0].legs[0];
            const originMarker = new google.maps.Marker({
                position: leg.start_location,
                map: map,
                icon: {
                    url: 'https://maps.gstatic.com/mapfiles/ms2/micons/man.png', // URL del icono de persona
                    scaledSize: new google.maps.Size(30, 30) // Ajusta el tamaño del icono según sea necesario
                }
            });

            const destinationMarker = new google.maps.Marker({
                position: leg.end_location,
                map: map,
                icon: {
                    url: 'flag.png', // URL del icono de meta
                    scaledSize: new google.maps.Size(30, 30) // Ajusta el tamaño del icono según sea necesario
                }
            });

            // Mostrar información de distancia y tiempo
            const infoDiv = document.getElementById('info');
            infoDiv.innerHTML = `
                <p data-text-es="Parada más cercana" data-text-en="Nearest stop">Parada más cercana</p>: ${stopName}<br>
                <p data-text-es="Distancia" data-text-en="Distance">Distancia</p>: ${leg.distance.text}<br>
                <p data-text-es="Tiempo estimado caminando" data-text-en="Estimated walking time">Tiempo estimado caminando</p>: ${leg.duration.text}
            `;

            document.getElementById('info-card').style.display = 'block';
            document.getElementById('start-navigation').style.display = 'block';
        } else {
            console.error('Failed to load directions:', status);
            alert('Failed to load directions: ' + status);
        }
    });
}

function startNavigation() {
    const origin = userLocationGlobal;
    const destination = nearestStopLocationGlobal;

    if (origin && destination) {
        const url = `https://www.google.com/maps/dir/?api=1&origin=${origin.lat()},${origin.lng()}&destination=${destination.lat()},${destination.lng()}&travelmode=walking`;
        window.open(url, '_blank');
    } else {
        alert("No se pudo iniciar la navegación. Asegúrate de haber seleccionado una ubicación y encontrado la parada más cercana.");
    }
}

function setLanguage(language) {
    const elements = document.querySelectorAll('[data-text-es], [data-text-en]');

    elements.forEach(element => {
        const text = element.getAttribute(`data-text-${language}`);
        if (text) {
            element.innerText = text;
        }
    });

    const placeholders = document.querySelectorAll('input[data-placeholder-es], input[data-placeholder-en]');
    placeholders.forEach(input => {
        const placeholder = input.getAttribute(`data-placeholder-${language}`);
        if (placeholder) {
            input.setAttribute('placeholder', placeholder);
        }
    });
}
