## 빅데이터 크롤링 및 DB 처리 작업

### 담당 업무

#### **수집기**
  - 포털, 뉴스 등등 사이트의 크롤링 수집기 개발 및 유지보수
  - 수집된 데이터(json) 변환 및 DB적재 모듈 개발 유지보수
  - 수집시 최대 100개 이상의 ec2서버 운용 및 배포 작업
  - 수집기 모듈은 이미지(AMI)로 관리

#### **DB**
  - MongoDB 설계 및 구축 작업
  - ElastickSearch의 logstash, filebeat, kibana로 대용량 데이터 input 작업 
  - Mysql로 수집 info 관리 작업 및 유지보수


## Aws → Azure 이관 작업

### 담당 업무

   - 수집기 모듈 내부에 사용된 AWS S3, SQS관련 모듈 Azure Blob Storage, ServiceBus queue로 변경
   - 관련 모듈 테스트 및 배포
   - 소스 리펙토링
   - 스토리지 관련 CLI 변경 작업


## 수집기 구조

### master
   - 수집 요청 시 db정보를 읽어 request queue에 메세지 생성
   - response queue에 메세지 생성된 수집 완료 메세지 처리
   
### worker
   - request queue를 읽어 수집기 종류에 따라 수집 시작
   - 수집 정상 완료시 response queue에 메세지 생성