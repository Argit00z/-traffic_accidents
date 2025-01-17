<?php
    // Параметры подключения к базе данных
    $host = "localhost";
    $dbname = "Russian_traffic_accidents";
    $user = "postgres";
    $password = "postgres";

    // Подключение к базе данных
    $connection = pg_connect("host=$host dbname=$dbname user=$user password=$password");

    // Проверка подключения
    if (!$connection) {
        die("Ошибка подключения: " . pg_last_error());
    }
    echo "Подключение к БД прошло успешно.";

    // Закрытие соединения (опционально, так как PHP автоматически закрывает соединение после завершения скрипта)
    pg_close($connection);
?>