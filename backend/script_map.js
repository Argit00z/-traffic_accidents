// Инициализация карты
const map = L.map('map').setView([55.7558, 37.6176], 13); // Начальная позиция карты (Москва)

// Добавление слоя OpenStreetMap
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Кеш для геокодирования
const geocodeCache = {};

// Функция для геокодирования (преобразования текста в координаты)
function geocode(query, callback) {
    if (geocodeCache[query]) {
        callback(geocodeCache[query]);
        return;
    }

    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`;
    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (data.length > 0) {
                const lat = parseFloat(data[0].lat);
                const lng = parseFloat(data[0].lon);
                const result = { lat, lng };
                geocodeCache[query] = result;
                callback(result);
            } else {
                alert('Место не найдено. Пожалуйста, уточните запрос.');
            }
        })
        .catch(error => {
            console.error('Ошибка при геокодировании:', error);
            setTimeout(() => geocode(query, callback), 2000);
        });
}

// Функция для поиска опасных участков
function findDangerousSections(route, accidents) {
    const dangerousSections = [];
    const threshold = 1; // Порог количества ДТП

    // Преобразуем маршрут в LineString
    const routeLine = turf.lineString(route.map(coord => [coord[0], coord[1]]));

    // Создаем объект для подсчета количества ДТП вблизи маршрута
    const accidentCounts = {};

    // Проверяем каждое ДТП
    accidents.forEach(accident => {
        // Проверяем, что latitude и longitude являются числами
        const lat = parseFloat(accident.latitude);
        const lng = parseFloat(accident.longitude);

        if (isNaN(lat) || isNaN(lng)) {
            console.warn('Некорректные координаты ДТП:', accident);
            return; // Пропускаем это ДТП
        }

        const point = turf.point([lng, lat]);
        const nearestPoint = turf.nearestPointOnLine(routeLine, point);

        // Если ДТП находится в пределах 100 метров от маршрута
        if (nearestPoint.properties.dist < 0.1) { // 100 метров
            // Увеличиваем счетчик ДТП для этого участка
            const sectionKey = `${nearestPoint.geometry.coordinates[0]},${nearestPoint.geometry.coordinates[1]}`;
            accidentCounts[sectionKey] = (accidentCounts[sectionKey] || 0) + 1;

            // Если количество ДТП превышает порог, добавляем участок в опасные
            if (accidentCounts[sectionKey] >= threshold) {
                dangerousSections.push(nearestPoint);
            }
        }
    });

    return dangerousSections;
}

// Функция для определения региона по координатам
async function getRegionFromCoordinates(lat, lng) {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.address && data.address.state) {
        return data.address.state;
    }
    return null;
}

// Функция для получения уникальных регионов из маршрута
async function getRegionsFromRoute(route) {
    const regions = new Set();
    for (let i = 0; i < route.length; i += 100) {
        const [lng, lat] = route[i];
        const region = await getRegionFromCoordinates(lat, lng);
        if (region) {
            regions.add(region);
        }
    }
    return Array.from(regions);
}

// Функция для вычисления расстояния между двумя точками
function getDistance(point1, point2) {
    const R = 6371; // Радиус Земли в км
    const dLat = (point2.lat - point1.lat) * Math.PI / 180;
    const dLng = (point2.lng - point1.lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(point1.lat * Math.PI / 180) * Math.cos(point2.lat * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Расстояние в километрах
}

// Функция для группировки точек по близости
function groupPoints(points, maxDistance) {
    const groupedPoints = [];

    points.forEach(point => {
        let addedToGroup = false;

        // Проверяем, можно ли добавить точку в существующую группу
        for (let group of groupedPoints) {
            const distance = getDistance(
                { lat: point.geometry.coordinates[1], lng: point.geometry.coordinates[0] },
                { lat: group.center[1], lng: group.center[0] }
            );

            // Если точка находится в пределах maxDistance, добавляем её в группу
            if (distance <= maxDistance) {
                group.points.push(point);
                group.center = [
                    (group.center[0] * group.points.length + point.geometry.coordinates[0]) / (group.points.length + 1),
                    (group.center[1] * group.points.length + point.geometry.coordinates[1]) / (group.points.length + 1)
                ];
                addedToGroup = true;
                break;
            }
        }

        // Если точка не добавлена ни в одну группу, создаём новую группу
        if (!addedToGroup) {
            groupedPoints.push({
                center: [point.geometry.coordinates[0], point.geometry.coordinates[1]],
                points: [point]
            });
        }
    });

    return groupedPoints;
}

// Массив для хранения красных полилиний
let dangerousPolylines = [];

// Функция для построения маршрута
async function buildRoute(start, end) {
    document.getElementById('loading').style.display = 'block';
    const startDate = "2020-01-01"; // Начальная дата (например, 1 января 2010 года)
    const endDate = "2024-12-31";
    const routingServiceUrl = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`;

    // Удаляем все существующие красные полилинии
    dangerousPolylines.forEach(polyline => map.removeLayer(polyline));
    dangerousPolylines = [];

    try {
        // Получаем данные о маршруте
        const response = await fetch(routingServiceUrl);
        if (!response.ok) throw new Error('Ошибка при построении маршрута');
        const data = await response.json();
        console.log('Данные о маршруте:', data);

        // Очистка предыдущего маршрута
        if (window.routeLine) map.removeLayer(window.routeLine);

        const route = data.routes[0].geometry.coordinates;
        const routeLineString = turf.lineString(route.map(coord => [coord[0], coord[1]])); // Преобразуем маршрут в LineString
        window.routeLine = L.polyline(route.map(coord => [coord[1], coord[0]]), {
            color: 'blue'
        }).addTo(map);
        console.log('Маршрут отображён на карте');

        // Установка границ карты по маршруту
        map.fitBounds(window.routeLine.getBounds());

        // Определяем регионы по маршруту
        const regions = await getRegionsFromRoute(route);
        console.log("Регионы по маршруту:", regions);

        if (regions.length === 0) throw new Error('Не удалось определить регионы по маршруту');

        // Получаем данные о ДТП для этих регионов
        const accidentsResponse = await fetch(`/backend/get-accidents.php?region=${regions.join(',')}&start_date=${startDate}&end_date=${endDate}`);
        if (!accidentsResponse.ok) {
            const errorText = await accidentsResponse.text();
            console.error('Ошибка при получении данных о ДТП:', errorText);
            throw new Error('Ошибка при получении данных о ДТП');
        }
        const accidents = await accidentsResponse.json();
        console.log('Данные о ДТП:', accidents);

        // Определение опасных участков
        const dangerousSections = findDangerousSections(route, accidents);
        console.log('Опасные участки:', dangerousSections);

        // Группировка опасных участков
        const groupedSections = groupPoints(dangerousSections, 1); // Группируем точки в пределах 1 км

        // Отображение опасных участков на карте
        groupedSections.forEach(group => {
            // Привязываем центр группы к ближайшей точке на маршруте
            const centerPoint = turf.point([group.center[0], group.center[1]]);
            const nearestPointOnRoute = turf.nearestPointOnLine(routeLineString, centerPoint);

            const lng = nearestPointOnRoute.geometry.coordinates[0];
            const lat = nearestPointOnRoute.geometry.coordinates[1];

            // Проверяем, что координаты являются числами
            if (Number.isNaN(lng) || Number.isNaN(lat)) {
                console.warn('Некорректные координаты:', group);
                return; // Пропускаем этот участок
            }

            // Создаём маркер для группы
            const marker = L.circleMarker([lat, lng], {
                color: 'red',
                radius: 5 + Math.log(group.points.length) * 2, // Размер маркера зависит от количества точек в группе
                fillOpacity: 0.8
            }).addTo(map);

            // Добавляем подсказку с количеством точек в группе
            marker.bindTooltip(`Опасных участков: ${group.points.length}`, {
                permanent: false,
                direction: 'top'
            });

            dangerousPolylines.push(marker);
            console.log('Группа опасных участков отображена на карте:', group);
        });

        // Вывод рекомендаций
        const routeInfo = document.getElementById('route-info');
        let infoText = 'Рекомендации по маршруту:<br>';
        groupedSections.forEach(group => {
            infoText += `Будьте осторожны на участке дороги около (${group.center[1].toFixed(4)}, ${group.center[0].toFixed(4)}). Количество опасных участков: ${group.points.length}. Снизьте скорость.<br>`;
        });
        routeInfo.innerHTML = infoText;
    } catch (error) {
        console.error('Ошибка:', error);
        alert('Произошла ошибка при загрузке данных. Пожалуйста, попробуйте позже.');
    } finally {
        document.getElementById('loading').style.display = 'none';
    }
}

// Функция для построения маршрута на основе введенных данных
function buildRouteFromInput() {
    const startQuery = document.getElementById('start').value;
    const endQuery = document.getElementById('end').value;

    if (startQuery && endQuery) {
        geocode(startQuery, (startCoords) => {
            geocode(endQuery, (endCoords) => {
                buildRoute(startCoords, endCoords);
            });
        });
    } else {
        alert('Пожалуйста, введите начальную и конечную точки.');
    }
}