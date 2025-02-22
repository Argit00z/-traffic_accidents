<?php
ini_set('display_errors', 0); // Отключаем вывод ошибок на экран
ini_set('log_errors', 1); // Включаем логирование ошибок
error_reporting(E_ALL); // Включаем отчет обо всех ошибках

header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json');

$host = "localhost";
$dbname = "Russian_traffic_accidents";
$user = "postgres";
$password = "postgres";

// Подключение к базе данных
$connection = pg_connect("host=$host dbname=$dbname user=$user password=$password");

if (!$connection) {
    echo json_encode(["error" => "Ошибка подключения: " . pg_last_error()]);
    exit;
}

// Получаем параметры из запроса
$region = $_GET['region'] ?? null;
$start_date = $_GET['start_date'] ?? '2023-01-01'; // Начальная дата по умолчанию
$end_date = $_GET['end_date'] ?? '2024-12-31';     // Конечная дата по умолчанию
$experience = $_GET['experience'] ?? 'beginner';   // Стаж вождения по умолчанию
$limit = 100000; // Ограничиваем количество строк

// Проверяем, что регион передан
if (!$region) {
    echo json_encode(["error" => "Параметр 'region' отсутствует"]);
    exit;
}

// Экранируем регионы для безопасности
$regions = array_map('pg_escape_string', explode(',', $region));

// Категории ДТП, которые мы хотим учитывать
$categories = ['Наезд на пешехода', 'Столкновение', 'Наезд на стоящее ТС', 'Наезд на препятствие'];
$categories = array_map('pg_escape_string', $categories);

// Формируем SQL-запрос в зависимости от стажа вождения
if ($experience === 'beginner') {
    // Для начинающих водителей учитываем все степени тяжести
    $severityCondition = "severity IN ('Легкий', 'Тяжёлый', 'С погибшими')";
} else {
    // Для опытных водителей учитываем только тяжёлые ДТП и ДТП с погибшими
    $severityCondition = "severity IN ('Тяжёлый', 'С погибшими')";
}

$query = "SELECT id, latitude, longitude, severity, category 
          FROM accidents 
          WHERE region IN ('" . implode("','", $regions) . "')
          AND datetime::date BETWEEN '$start_date' AND '$end_date'
          AND category IN ('" . implode("','", $categories) . "')
          AND $severityCondition
          LIMIT $limit";

// Выполняем запрос
$result = pg_query($connection, $query);

if (!$result) {
    echo json_encode(["error" => "Ошибка выполнения запроса: " . pg_last_error()]);
    exit;
}

// Формируем массив с результатами
$accidents = [];
while ($row = pg_fetch_assoc($result)) {
    $accidents[] = $row;
}

// Возвращаем результат в формате JSON
echo json_encode($accidents);

// Закрываем соединение с базой данных
pg_close($connection);
?>