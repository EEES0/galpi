# Render + PostgreSQL 배포

1. Render Postgres를 생성하고 같은 계정/리전에서 Web Service를 만듭니다.
2. 저장소를 연결하고 Runtime을 Docker로 선택합니다. Dockerfile 경로는 ./Dockerfile입니다. 별도 Build/Start Command는 필요하지 않습니다.
3. Web Service의 Environment에 아래 값을 넣고 배포합니다. 로컬 .env는 Render에 자동 전달되지 않습니다.

| 변수 | 값 |
| --- | --- |
| OPENAI_API_KEY | 실제 API 키, 필수 |
| SPRING_DATASOURCE_URL | jdbc:postgresql://내부호스트:5432/DB이름?sslmode=require, 필수 |
| SPRING_DATASOURCE_USERNAME | Render Postgres Username, 필수 |
| SPRING_DATASOURCE_PASSWORD | Render Postgres Password, 필수 |
| OPENAI_MODEL | 선택, 기본 gpt-6-luna |
| SPRING_JPA_HIBERNATE_DDL_AUTO | 선택, 기본 update |
| SPRING_JPA_SHOW_SQL | 선택, 기본 false |

DB 상세 화면의 Internal 연결 정보에서 Hostname, Database, Username, Password를 가져옵니다. Render가 제공하는 postgresql://사용자:비밀번호@호스트/DB URL을 그대로 넣지 마세요. JDBC URL에 사용자/비밀번호를 포함하지 않고 별도 변수로 전달합니다. DATABASE_URL은 이 앱에서 읽지 않습니다.

PORT는 Render가 자동으로 제공합니다. 앱은 이 포트를 사용하고 0.0.0.0에 바인딩됩니다. HTTPS 프록시 헤더도 처리합니다. Render의 HTTPS 주소에서 프론트와 API를 함께 제공합니다.

API 키와 DB 비밀번호는 실행 환경변수로만 주입합니다. .env 파일은 Git과 Docker 빌드 컨텍스트에서 제외됩니다.

테이블은 update로 자동 생성/갱신합니다. 별도 스키마 마이그레이션을 사용하는 경우 validate로 변경할 수 있습니다. MySQL 데이터는 자동 이전되지 않습니다.

## 로컬 실행

compose.yaml은 로컬 PostgreSQL용입니다. Render에서는 사용하지 않습니다.
.env.example을 .env로 복사하고 OPENAI_API_KEY와 POSTGRES_PASSWORD를 입력합니다.

docker compose up -d --build

기본 접속 주소는 http://localhost:8080 입니다. 데이터는 postgres-data 볼륨에 보존됩니다.
docker compose down -v는 DB 데이터까지 삭제합니다. 이전 MySQL 볼륨은 사용하거나 삭제하지 않습니다.

## 공식 문서
- https://render.com/docs/postgresql-creating-connecting
- https://render.com/docs/docker
- https://render.com/docs/web-services#port-binding
