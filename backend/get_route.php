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

$route_id = $_GET['route_id'] ?? null;

if (!$route_id) {
    echo json_encode(["error" => "Необходимо указать route_id"]);
    exit;
}

// Получаем маршрут из базы данных
$query = "SELECT * FROM routes WHERE id = $1";
$result = pg_query_params($connection, $query, [$route_id]);

if (!$result) {
    echo json_encode(["error" => "Ошибка при получении маршрута: " . pg_last_error()]);
    exit;
}

$route = pg_fetch_assoc($result);

if (!$route) {
    echo json_encode(["error" => "Маршрут не найден"]);
    exit;
}

echo json_encode(["success" => true, "route" => $route]);

pg_close($connection);
?>