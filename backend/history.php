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

// Получаем user_id из запроса
$user_id = $_GET['user_id'] ?? null;

if (!$user_id) {
    echo json_encode(["error" => "Необходимо указать user_id"]);
    exit;
}

// Запрос к базе данных для получения истории маршрутов
$query = "SELECT * FROM routes WHERE user_id = $1 ORDER BY created_at DESC";
$result = pg_query_params($connection, $query, [$user_id]);

if (!$result) {
    echo json_encode(["error" => "Ошибка при получении истории маршрутов: " . pg_last_error()]);
    exit;
}

$history = [];
while ($row = pg_fetch_assoc($result)) {
    $history[] = $row;
}

echo json_encode(["success" => true, "history" => $history]);

pg_close($connection);
?>