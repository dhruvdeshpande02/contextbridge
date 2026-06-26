def test_register_success(client):
    res = client.post("/auth/register", json={"email": "new@test.com", "password": "pw123456"})
    assert res.status_code == 201
    body = res.json()
    assert body["email"] == "new@test.com"
    assert "id" in body
    assert "password" not in body  # never leak the password


def test_register_duplicate_email(client):
    payload = {"email": "dup@test.com", "password": "pw123456"}
    client.post("/auth/register", json=payload)
    res = client.post("/auth/register", json=payload)
    assert res.status_code == 400
    assert "already registered" in res.json()["detail"].lower()


def test_login_success(client, registered_user):
    res = client.post("/auth/login", data={
        "username": registered_user["email"],
        "password": registered_user["password"],
    })
    assert res.status_code == 200
    body = res.json()
    assert "access_token" in body
    assert body["token_type"] == "bearer"


def test_login_wrong_password(client, registered_user):
    res = client.post("/auth/login", data={
        "username": registered_user["email"],
        "password": "wrongpassword",
    })
    assert res.status_code == 401


def test_login_unknown_email(client):
    res = client.post("/auth/login", data={
        "username": "nobody@test.com",
        "password": "pw123456",
    })
    assert res.status_code == 401


def test_protected_route_requires_token(client):
    res = client.get("/meetings")
    assert res.status_code == 401
