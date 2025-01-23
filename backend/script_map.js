// Инициализация карты
const map = L.map('map').setView([55.7558, 37.6176], 13); // Начальная позиция карты (Москва)

// Добавление слоя OpenStreetMap
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Кеш для геокодирования
const geocodeCache = {};

// Глобальный объект для хранения элементов карты
let mapElements = {
    markers: [], // Маркеры с рекомендациями
    routeLine: null, // Линия маршрута
    startMarker: null, // Маркер начала маршрута
    endMarker: null // Маркер конца маршрута
};

// Функция для очистки карты
function clearMap() {
    // Удаляем все маркеры с рекомендациями
    mapElements.markers.forEach(marker => map.removeLayer(marker));
    mapElements.markers = []; // Очищаем массив

    // Удаляем линию маршрута
    if (mapElements.routeLine) {
        map.removeLayer(mapElements.routeLine);
        mapElements.routeLine = null;
    }

    // Удаляем маркеры начала и конца маршрута
    if (mapElements.startMarker) {
        map.removeLayer(mapElements.startMarker);
        mapElements.startMarker = null;
    }
    if (mapElements.endMarker) {
        map.removeLayer(mapElements.endMarker);
        mapElements.endMarker = null;
    }
}

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

// Объект для сопоставления категорий ДТП с цветами
const categoryColors = {
    'Наезд на пешехода': 'red',
    'Столкновение': 'blue',
    'Наезд на стоящее ТС': 'green',
    'Наезд на препятствие': 'orange'
};

// Функция для получения рекомендации по категории ДТП
function getWarningByCategory(category) {
    switch (category) {
        case 'Наезд на пешехода':
            return 'Будьте внимательны к пешеходам, особенно в зонах пешеходных переходов. Снизьте скорость и будьте готовы к внезапному появлению людей на дороге.';
        case 'Столкновение':
            return 'Соблюдайте дистанцию и скоростной режим, чтобы избежать столкновений. Обращайте внимание на сигналы светофоров и поведение других водителей.';
        case 'Наезд на стоящее ТС':
            return 'Обращайте внимание на стоящие транспортные средства, особенно в узких местах. Снизьте скорость и держитесь на безопасном расстоянии.';
        case 'Наезд на препятствие':
            return 'Следите за дорожными знаками и разметкой, чтобы избежать наезда на препятствия. Будьте осторожны на участках с ограниченной видимостью.';
        default:
            return 'Будьте осторожны на этом участке дороги. Снизьте скорость и соблюдайте правила дорожного движения.';
    }
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
                dangerousSections.push({
                    ...nearestPoint,
                    category: accident.category // Добавляем категорию ДТП
                });
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

// Функция для группировки точек
function groupPoints(points, maxDistance) {
    const groupedPoints = [];
    points.forEach(point => {
        let addedToGroup = false;
        for (let group of groupedPoints) {
            if (group.category !== point.category) continue;
            const isNear = group.points.some(groupPoint => {
                return getDistance(
                    { lat: point.geometry.coordinates[1], lng: point.geometry.coordinates[0] },
                    { lat: groupPoint.geometry.coordinates[1], lng: groupPoint.geometry.coordinates[0] }
                ) <= maxDistance;
            });
            if (isNear) {
                group.points.push(point);
                group.center = [
                    group.points.reduce((sum, p) => sum + p.geometry.coordinates[0], 0) / group.points.length,
                    group.points.reduce((sum, p) => sum + p.geometry.coordinates[1], 0) / group.points.length
                ];
                group.distanceAlongRoute = group.points.reduce((sum, p) => sum + p.distanceAlongRoute, 0) / group.points.length;
                addedToGroup = true;
                break;
            }
        }
        if (!addedToGroup) {
            groupedPoints.push({
                center: [point.geometry.coordinates[0], point.geometry.coordinates[1]],
                points: [point],
                category: point.category,
                distanceAlongRoute: point.distanceAlongRoute
            });
        }
    });
    return groupedPoints;
}

// Функция для сортировки точек вдоль маршрута
function sortPointsAlongRoute(routeLineString, points) {
    return points.map(point => {
        const nearestPoint = turf.nearestPointOnLine(routeLineString, point);
        return {
            ...point,
            distanceAlongRoute: nearestPoint.properties.location // Расстояние вдоль маршрута
        };
    }).sort((a, b) => a.distanceAlongRoute - b.distanceAlongRoute); // Сортируем по расстоянию от начала маршрута
}

// Функция для определения положения участка относительно города
function getLocationDescription(distanceAlongRoute, routeLength) {
    const threshold = 0.2; // Порог для определения въезда/выезда (20% от длины маршрута)

    if (distanceAlongRoute < routeLength * threshold) {
        return 'въезд';
    } else if (distanceAlongRoute > routeLength * (1 - threshold)) {
        return 'выезд';
    } else {
        return 'внутри';
    }
}

// Функция для определения населенного пункта по координатам
async function getLocationFromCoordinates(lat, lng) {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.address) {
            // Возвращаем город, деревню, поселок или другой населенный пункт
            return (
                data.address.city ||
                data.address.town ||
                data.address.village ||
                data.address.hamlet ||
                data.address.suburb ||
                data.address.state || // Если населенный пункт не найден, возвращаем регион
                'неизвестно'
            );
        }
        return 'неизвестно'; // Если адрес не найден
    } catch (error) {
        console.error('Ошибка при определении населенного пункта:', error);
        return 'неизвестно';
    }
}

// Функция для получения адреса по координатам
async function getAddressFromCoordinates(lat, lng) {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.address) {
            // Возвращаем улицу, если она есть, или другой адрес
            return data.address.road || data.address.hamlet || data.address.village || data.address.city || 'Неизвестный адрес';
        }
        return 'Неизвестный адрес';
    } catch (error) {
        console.error('Ошибка при получении адреса:', error);
        return 'Неизвестный адрес';
    }
}

// Функция для построения маршрута
async function buildRoute(start, end) {
    // Очищаем карту перед построением нового маршрута
    clearMap();

    document.getElementById('loading').style.display = 'block';
    const startDate = "2020-01-01"; // Начальная дата
    const endDate = "2024-12-31";
    const experience = document.getElementById('experience').value; // Получаем выбранный стаж

    const routingServiceUrl = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`;

    try {
        // Получаем данные о маршруте
        const response = await fetch(routingServiceUrl);
        if (!response.ok) throw new Error('Ошибка при построении маршрута');
        const data = await response.json();
        const route = data.routes[0].geometry.coordinates;

        // Добавляем линию маршрута на карту
        mapElements.routeLine = L.polyline(route.map(coord => [coord[1], coord[0]]), { color: 'blue' }).addTo(map);
        map.fitBounds(mapElements.routeLine.getBounds());

        // Добавляем маркеры начала и конца маршрута
        mapElements.startMarker = L.marker([start.lat, start.lng], { title: 'Начало маршрута' }).addTo(map).bindPopup('Начало маршрута');
        mapElements.endMarker = L.marker([end.lat, end.lng], { title: 'Конец маршрута' }).addTo(map).bindPopup('Конец маршрута');

        // Определяем регионы по маршруту
        const regions = await getRegionsFromRoute(route);
        if (regions.length === 0) throw new Error('Не удалось определить регионы по маршруту');

        // Получаем данные о ДТП для этих регионов
        const accidentsResponse = await fetch(`/backend/get-accidents.php?region=${regions.join(',')}&start_date=${startDate}&end_date=${endDate}&experience=${experience}`);
        if (!accidentsResponse.ok) throw new Error('Ошибка при получении данных о ДТП');
        const accidents = await accidentsResponse.json();

        // Определение опасных участков
        const dangerousSections = findDangerousSections(route, accidents);

        // Сохраняем маршрут и рекомендации в базу данных
        const userId = localStorage.getItem('user_id');
        if (userId) {
            const saveRouteResponse = await fetch('/backend/save_route.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    user_id: userId,
                    start_point: `${start.lat},${start.lng}`,
                    end_point: `${end.lat},${end.lng}`,
                    route_coordinates: JSON.stringify(route),
                    recommendations: JSON.stringify(dangerousSections)
                })
            });

            if (!saveRouteResponse.ok) {
                throw new Error('Ошибка при сохранении маршрута');
            }
        }

        // Группировка опасных участков
        const groupedSections = groupPoints(dangerousSections, 1); // Группируем точки в пределах 1 км

        // Преобразуем маршрут в LineString для сортировки
        const routeLineString = turf.lineString(route.map(coord => [coord[0], coord[1]]));

        // Сортируем группы по расстоянию вдоль маршрута
        const sortedGroups = groupedSections
            .filter(group => group.points.length > 1) // Фильтруем группы с одним или менее участком
            .map(group => {
                const nearestPoint = turf.nearestPointOnLine(routeLineString, turf.point(group.center));
                group.distanceAlongRoute = nearestPoint.properties.location; // Расстояние вдоль маршрута
                return group;
            })
            .sort((a, b) => a.distanceAlongRoute - b.distanceAlongRoute); // Сортируем по расстоянию

        // Длина маршрута для определения положения участка
        const routeLength = turf.length(routeLineString);

        // Группировка по населенным пунктам и типам участков
        const locationsMap = new Map();
        for (const group of sortedGroups) {
            const [lng, lat] = group.center;
            const location = await getLocationFromCoordinates(lat, lng);
            if (!locationsMap.has(location)) {
                locationsMap.set(location, {
                    въезд: [],
                    внутри: [],
                    выезд: []
                });
            }
            const description = getLocationDescription(group.distanceAlongRoute, routeLength);
            switch (description) {
                case 'въезд':
                    locationsMap.get(location).въезд.push(group);
                    break;
                case 'внутри':
                    locationsMap.get(location).внутри.push(group);
                    break;
                case 'выезд':
                    locationsMap.get(location).выезд.push(group);
                    break;
            }

            // Отрисовка маркеров для каждой группы
            const color = categoryColors[group.points[0].category] || 'gray'; // Цвет маркера в зависимости от категории
            const marker = L.circleMarker([lat, lng], {
                color: color,
                radius: 5 + Math.log(group.points.length) * 2, // Размер маркера зависит от количества ДТП
                fillOpacity: 0.8
            }).addTo(map);

            // Добавляем маркер в массив для последующего удаления
            mapElements.markers.push(marker);

            // Всплывающая подсказка с информацией
            const tooltipText = `
                <strong>Количество ДТП:</strong> ${group.points.length}<br>
                <strong>Категория ДТП:</strong> ${group.points[0].category}<br>
                <strong>Рекомендация:</strong> ${getWarningByCategory(group.points[0].category)}<br>
                <em>Этот участок находится вблизи вашего маршрута (в пределах 100 метров).</em>
            `;
            marker.bindTooltip(tooltipText, { permanent: false, direction: 'top' });

            // Анимация при клике на маркер
            marker.on('click', function () {
                // Создаем линию от маркера до ближайшей точки на маршруте
                const nearestPoint = turf.nearestPointOnLine(routeLineString, turf.point([lng, lat]));
                const line = L.polyline([
                    [lat, lng],
                    [nearestPoint.geometry.coordinates[1], nearestPoint.geometry.coordinates[0]]
                ], { color: 'gray', dashArray: '5,5' }).addTo(map);

                // Удаляем линию через 3 секунды
                setTimeout(() => {
                    map.removeLayer(line);
                }, 3000);
            });
        }

        // Добавление обучающего туториала
        const tutorial = L.control({ position: 'topright' });

        tutorial.onAdd = function (map) {
            const div = L.DomUtil.create('div', 'info tutorial');
            div.innerHTML = `
                <h4>Как это работает?</h4>
                <p>Маркеры показывают опасные участки вблизи вашего маршрута (до 100 метров). 
                Они могут находиться не на самом маршруте, но в зоне повышенного риска.</p>
                <button onclick="this.parentElement.style.display='none';">Понятно</button>
            `;
            return div;
        };

        tutorial.addTo(map);

        // Вывод рекомендаций в route-info
        const routeInfo = document.getElementById('route-info');
        let infoText = '';

        // Проходим по отсортированным группам и выводим их в порядке маршрута
        let counter = 1; // Счетчик для нумерации участков и кнопок
        for (const [location, sections] of locationsMap) {
            // Подсчет общего количества опасных участков для текущего региона
            const totalDangerousSections = sections.въезд.length + sections.внутри.length + sections.выезд.length;

            // Выводим количество опасных участков для региона
            infoText += `<strong>${location}</strong> (опасных участков: ${totalDangerousSections})<br>`;

            // Выводим участки "въезд"
            if (sections.въезд.length > 0) {
                infoText += `<p>При въезде в город ${location} будьте осторожны на следующих участках:</p>`;
                for (const group of sections.въезд) {
                    const centerLat = group.center[1].toFixed(4);
                    const centerLng = group.center[0].toFixed(4);
                    const address = await getAddressFromCoordinates(centerLat, centerLng); // Получаем адрес
                    infoText += `
                        <div class="recommendation">
                            <p><strong>Участок ${counter}:</strong> ${address}</p>
                            <button onclick="map.setView([${centerLat}, ${centerLng}], 15)">Перейти к участку ${counter}</button>
                        </div>
                    `;
                    counter++;
                }
            }

            // Выводим участки "внутри"
            if (sections.внутри.length > 0) {
                infoText += `<p>В городе ${location} будьте осторожны на следующих участках:</p>`;
                for (const group of sections.внутри) {
                    const centerLat = group.center[1].toFixed(4);
                    const centerLng = group.center[0].toFixed(4);
                    const address = await getAddressFromCoordinates(centerLat, centerLng); // Получаем адрес
                    infoText += `
                        <div class="recommendation">
                            <p><strong>Участок ${counter}:</strong> ${address}</p>
                            <button onclick="map.setView([${centerLat}, ${centerLng}], 15)">Перейти к участку ${counter}</button>
                        </div>
                    `;
                    counter++;
                }
            }

            // Выводим участки "выезд"
            if (sections.выезд.length > 0) {
                infoText += `<p>При выезде из города ${location} будьте осторожны на следующих участках:</p>`;
                for (const group of sections.выезд) {
                    const centerLat = group.center[1].toFixed(4);
                    const centerLng = group.center[0].toFixed(4);
                    const address = await getAddressFromCoordinates(centerLat, centerLng); // Получаем адрес
                    infoText += `
                        <div class="recommendation">
                            <p><strong>Участок ${counter}:</strong> ${address}</p>
                            <button onclick="map.setView([${centerLat}, ${centerLng}], 15)">Перейти к участку ${counter}</button>
                        </div>
                    `;
                    counter++;
                }
            }
        }

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

// Функция для отображения рекомендаций на карте
function displayRecommendations(recommendations) {
    if (!recommendations || !Array.isArray(recommendations)) {
        console.error('Рекомендации не переданы или переданы в неверном формате');
        return;
    }

    recommendations.forEach(recommendation => {
        const marker = L.circleMarker([recommendation.lat, recommendation.lng], {
            color: recommendation.color || 'red', // Цвет маркера (по умолчанию красный)
            radius: 5 + Math.log(recommendation.count || 1) * 2, // Размер маркера зависит от количества ДТП
            fillOpacity: 0.8
        }).addTo(map);

        // Всплывающая подсказка с информацией
        const tooltipText = `
            <strong>Количество ДТП:</strong> ${recommendation.count || 0}<br>
            <strong>Категория ДТП:</strong> ${recommendation.category || 'Неизвестно'}<br>
            <strong>Рекомендация:</strong> ${getWarningByCategory(recommendation.category)}<br>
            <em>Этот участок находится вблизи вашего маршрута (в пределах 100 метров).</em>
        `;
        marker.bindTooltip(tooltipText, { permanent: false, direction: 'top' });

        // Добавляем маркер в массив для последующего удаления
        mapElements.markers.push(marker);
    });
}