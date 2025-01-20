<?php
header('Content-Type: application/json');

$host = "localhost";
$dbname = "Russian_traffic_accidents";
$user = "postgres";
$password = "postgres";

$connection = pg_connect("host=$host dbname=$dbname user=$user password=$password");

if (!$connection) {
    echo json_encode(["error" => "Ошибка подключения: " . pg_last_error()]);
    exit;
}

$data = json_decode(file_get_contents('php://input'), true);

$user_id = $data['user_id'] ?? null;
$start_point = $data['start_point'] ?? null;
$end_point = $data['end_point'] ?? null;
$route_coordinates = $data['route_coordinates'] ?? null;
$recommendations = $data['recommendations'] ?? null;

if (!$user_id || !$start_point || !$end_point || !$route_coordinates) {
    echo json_encode(["error" => "Необходимо указать user_id, start_point, end_point и route_coordinates"]);
    exit;
}

// Вставляем маршрут в базу данных
$query = "INSERT INTO routes (user_id, start_point, end_point, route_coordinates, recommendations) VALUES ($1, $2, $3, $4, $5)";
$result = pg_query_params($connection, $query, [$user_id, $start_point, $end_point, $route_coordinates, $recommendations]);

if (!$result) {
    echo json_encode(["error" => "Ошибка при сохранении маршрута: " . pg_last_error()]);
    exit;
}

echo json_encode(["success" => true]);

pg_close($connection);
?>