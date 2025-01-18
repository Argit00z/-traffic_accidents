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

// Объект для сопоставления категорий ДТП с цветами
const categoryColors = {
    'Наезд на пешехода': 'red',
    'Столкновение': 'blue',
    'Наезд на стоящее ТС': 'green',
    'Наезд на препятствие': 'orange'
};

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

// Функция для группировки точек по близости и категориям ДТП
function groupPoints(points, maxDistance) {
    const groupedPoints = [];

    points.forEach(point => {
        let addedToGroup = false;

        // Проверяем, можно ли добавить точку в существующую группу
        for (let group of groupedPoints) {
            // Проверяем, что категория ДТП совпадает
            if (group.category !== point.category) {
                continue; // Пропускаем группы с другой категорией
            }

            // Проверяем расстояние до каждой точки в группе
            const isNear = group.points.some(groupPoint => {
                const distance = getDistance(
                    { lat: point.geometry.coordinates[1], lng: point.geometry.coordinates[0] },
                    { lat: groupPoint.geometry.coordinates[1], lng: groupPoint.geometry.coordinates[0] }
                );
                return distance <= maxDistance;
            });

            // Если точка находится в пределах maxDistance от любой точки в группе, добавляем её в группу
            if (isNear) {
                group.points.push(point);
                // Пересчитываем центр группы
                group.center = [
                    group.points.reduce((sum, p) => sum + p.geometry.coordinates[0], 0) / group.points.length,
                    group.points.reduce((sum, p) => sum + p.geometry.coordinates[1], 0) / group.points.length
                ];
                addedToGroup = true;
                break;
            }
        }

        // Если точка не добавлена ни в одну группу, создаём новую группу
        if (!addedToGroup) {
            groupedPoints.push({
                center: [point.geometry.coordinates[0], point.geometry.coordinates[1]],
                points: [point],
                category: point.category // Сохраняем категорию ДТП для группы
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

// Функция для сортировки населенных пунктов вдоль маршрута
function sortLocationsAlongRoute(routeLineString, locationsMap) {
    const sortedLocations = [];

    locationsMap.forEach((groups, location) => {
        // Берем первую группу для определения координат населенного пункта
        const [lng, lat] = groups[0].center;

        // Находим ближайшую точку на маршруте
        const nearestPoint = turf.nearestPointOnLine(routeLineString, turf.point([lng, lat]));

        // Добавляем населенный пункт в массив с расстоянием вдоль маршрута
        sortedLocations.push({
            location,
            groups,
            distanceAlongRoute: nearestPoint.properties.location
        });
    });

    // Сортируем населенные пункты по расстоянию вдоль маршрута
    sortedLocations.sort((a, b) => a.distanceAlongRoute - b.distanceAlongRoute);

    return sortedLocations;
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

    // Удаляем предыдущие маркеры начала и конца маршрута
    if (window.startMarker) map.removeLayer(window.startMarker);
    if (window.endMarker) map.removeLayer(window.endMarker);

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

        // Добавляем маркеры начала и конца маршрута
        window.startMarker = L.marker([start.lat, start.lng], {
            title: 'Начало маршрута'
        }).addTo(map).bindPopup('Начало маршрута');

        window.endMarker = L.marker([end.lat, end.lng], {
            title: 'Конец маршрута'
        }).addTo(map).bindPopup('Конец маршрута');

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

        // Преобразуем центры групп в точки для сортировки
        const groupCenters = groupedSections.map(group => turf.point(group.center));

        // Сортируем опасные участки вдоль маршрута
        const sortedSections = sortPointsAlongRoute(routeLineString, groupCenters);

        // Отображение опасных участков на карте
        sortedSections.forEach((section, index) => {
            const group = groupedSections[index];

            // Пропускаем группы с одним или менее опасным участком
            if (group.points.length <= 1) {
                return;
            }

            const lng = section.geometry.coordinates[0];
            const lat = section.geometry.coordinates[1];

            // Проверяем, что координаты являются числами
            if (Number.isNaN(lng) || Number.isNaN(lat)) {
                console.warn('Некорректные координаты:', group);
                return; // Пропускаем этот участок
            }

            // Определяем цвет маркера на основе категории ДТП
            const category = group.points[0].category; // Берем категорию первой точки в группе
            const color = categoryColors[category] || 'gray'; // Если категория не найдена, используем серый цвет

            // Создаём маркер для группы
            const marker = L.circleMarker([lat, lng], {
                color: color,
                radius: 5 + Math.log(group.points.length) * 2, // Размер маркера зависит от количества точек в группе
                fillOpacity: 0.8
            }).addTo(map);

            // Добавляем подсказку с количеством точек в группе и категорией
            const categories = group.points.map(point => point.category).join(', ');
            marker.bindTooltip(`Опасных участков: ${group.points.length} (${categories})`, {
                permanent: false,
                direction: 'top'
            });

            // Добавляем текстовую подсказку
            const tooltipText = `Будьте осторожны на этом участке дороги. Количество опасных участков: ${group.points.length}. Категории: ${categories}. Снизьте скорость.`;
            marker.bindPopup(tooltipText);

            dangerousPolylines.push(marker);
            console.log('Группа опасных участков отображена на карте:', group);
        });

        // Вывод рекомендаций
        const routeInfo = document.getElementById('route-info');
        let infoText = 'Рекомендации по маршруту:<br>';

        // Группируем опасные участки по населенным пунктам
        const locationsMap = new Map();

        for (const group of groupedSections) {
            // Фильтруем группы, где количество ДТП больше одного
            if (group.points.length > 1) {
                const [lng, lat] = group.center;
                const location = await getLocationFromCoordinates(lat, lng);

                if (!locationsMap.has(location)) {
                    locationsMap.set(location, []);
                }

                locationsMap.get(location).push(group);
            }
        }

        // Сортируем населенные пункты вдоль маршрута
        const sortedLocations = sortLocationsAlongRoute(routeLineString, locationsMap);

        // Добавляем рекомендации для каждого населенного пункта в порядке маршрута
        sortedLocations.forEach(({ location, groups }) => {
            infoText += `
                <div class="recommendation">
                    <p>В населенном пункте ${location} будьте осторожны. Опасные участки:</p>
                    <ul>
                        ${groups.map(group => {
                            const category = group.category || 'неизвестно';
                            const warning = getWarningByCategory(category);
                            const centerLat = group.center[1].toFixed(4);
                            const centerLng = group.center[0].toFixed(4);

                            return `
                                <li>
                                    <p>Участок около (${centerLat}, ${centerLng})</p>
                                    <button onclick="map.setView([${centerLat}, ${centerLng}], 15)">Перейти к участку</button>
                                    <p>Количество ДТП: ${group.points.length}</p>
                                    <p>Категория ДТП: ${category}</p>
                                    <p>Рекомендация: ${warning}</p>
                                </li>
                            `;
                        }).join('')}
                    </ul>
                </div>
            `;
        });

        routeInfo.innerHTML = infoText;
    } catch (error) {
        console.error('Ошибка:', error);
        alert('Произошла ошибка при загрузке данных. Пожалуйста, попробуйте позже.');
    } finally {
        document.getElementById('loading').style.display = 'none';
    }
}

// Функция для получения рекомендации по категории ДТП
function getWarningByCategory(category) {
    switch (category) {
        case 'Наезд на пешехода':
            return 'Будьте внимательны к пешеходам, особенно в зонах пешеходных переходов.';
        case 'Столкновение':
            return 'Соблюдайте дистанцию и скоростной режим, чтобы избежать столкновений.';
        case 'Наезд на стоящее ТС':
            return 'Обращайте внимание на стоящие транспортные средства, особенно в узких местах.';
        case 'Наезд на препятствие':
            return 'Следите за дорожными знаками и разметкой, чтобы избежать наезда на препятствия.';
        default:
            return 'Будьте осторожны на этом участке дороги.';
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