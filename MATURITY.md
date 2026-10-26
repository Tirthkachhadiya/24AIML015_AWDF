# Richardson Maturity Model Evaluation: Task Management API

**Course**: Advanced Web Development Frameworks (ITUE301)  
**Student**: Tirth Kachhadiya (24AIML015)  
**Repository**: `task-manager-api`

---

## 1. Executive Summary

This document evaluates the Task Management RESTful API built with Node.js and Express against the **Richardson Maturity Model (RMM)**. The API achieves **Level 2 Conformance** by establishing resource-oriented URI endpoints (`/tasks`, `/tasks/:id`), utilizing standard HTTP verbs (`GET`, `POST`, `PUT`, `DELETE`), and returning explicit, standard HTTP status codes (`200 OK`, `201 Created`, `400 Bad Request`, `404 Not Found`, `500 Internal Server Error`).

---

## 2. Richardson Maturity Model Evaluation Table

| Level | Criterion | Does your API satisfy this? | Evidence / Code References |
| :---: | :--- | :---: | :--- |
| **Level 0** | **The Swamp of POX** (Single URI endpoint using a single HTTP method like `POST /api` for all operations). | **Satisfied (Surpassed)** | The API does not tunnel requests through a single endpoint like `/api`. Operations are routed via distinct URIs. |
| **Level 1** | **Resources** (Individual resources are addressed by dedicated URI paths). | **YES** | Discrete resource endpoints are defined for task collections (`GET /tasks`, `POST /tasks`) and individual items (`GET /tasks/:id`, `PUT /tasks/:id`, `DELETE /tasks/:id`). |
| **Level 2** | **HTTP Verbs & Status Codes** (Proper usage of standard HTTP methods and status codes for request outcomes). | **YES** | Uses `GET` (fetch), `POST` (create), `PUT` (update), `DELETE` (delete). Returns status `200` (success), `201` (created), `400` (validation error), `404` (not found), `500` (server error). |
| **Level 3** | **Hypermedia Controls (HATEOAS)** (API responses embed dynamic `_links` guiding clients on allowable state transitions). | **Awareness Provided** | Current production response body returns data attributes without hypermedia `_links`. Level 3 schema design is documented below. |

---

## 3. Detailed Endpoint Evaluation against Level 2 Criteria

### Endpoint Matrix

1. **`GET /tasks`**
   - **Method**: `GET`
   - **Status Code**: `200 OK`
   - **Level 2 Conformance**: Satisfied. Safe, idempotent retrieval of task collection.

2. **`GET /tasks/:id`**
   - **Method**: `GET`
   - **Status Code**: `200 OK` (Found) / `404 Not Found` (Missing) / `400 Bad Request` (Invalid ID format)
   - **Level 2 Conformance**: Satisfied. Explicit error status codes returned for invalid or missing task IDs.

3. **`POST /tasks`**
   - **Method**: `POST`
   - **Status Code**: `201 Created` (Success) / `400 Bad Request` (Missing JSON header or empty title)
   - **Level 2 Conformance**: Satisfied. Uses `201` status code for creation and `400` for validation failures.

4. **`PUT /tasks/:id`**
   - **Method**: `PUT`
   - **Status Code**: `200 OK` (Updated) / `404 Not Found` (Task missing) / `400 Bad Request` (Header or ID validation error)
   - **Level 2 Conformance**: Satisfied. Idempotent resource replacement/modification.

5. **`DELETE /tasks/:id`**
   - **Method**: `DELETE`
   - **Status Code**: `200 OK` (Deleted) / `404 Not Found` (Task missing)
   - **Level 2 Conformance**: Satisfied. Explicit removal of resource identified by URI.

---

## 4. HATEOAS Awareness (Level 3 Schema Design)

If this API were enhanced to satisfy **Level 3 (HATEOAS - Hypermedia As The Engine Of Application State)**, response bodies would include hypermedia metadata (`_links`) informing the client of allowable state transitions dynamically.

### Example Level 3 JSON Response Body:

```json
{
  "id": 1,
  "title": "Complete Practical 4",
  "description": "Create Express backend REST API pipeline",
  "completed": false,
  "_links": {
    "self": {
      "href": "/tasks/1",
      "method": "GET"
    },
    "update": {
      "href": "/tasks/1",
      "method": "PUT"
    },
    "delete": {
      "href": "/tasks/1",
      "method": "DELETE"
    },
    "collection": {
      "href": "/tasks",
      "method": "GET"
    }
  }
}
```

---

## 5. Reflection: Why Most Production APIs Stop at Level 2

While Level 3 (HATEOAS) provides self-describing REST APIs, the vast majority of commercial production web and mobile APIs (such as GitHub, Stripe, and Twitter/X) choose to stop at **Level 2**. 

The primary reasons include:
1. **Client Complexity & Overhead**: Parsing dynamic link structures increases JSON payload sizes and adds client-side parser complexity.
2. **Lack of Universally Adopted Client Tooling**: Standard web frontend frameworks (React, Vue, Angular, iOS/Android SDKs) typically build strongly typed API clients against documented schemas (OpenAPI/Swagger, GraphQL) rather than navigating dynamic hypermedia graphs at runtime.
3. **Pragmatism & Predictability**: Level 2 provides a clean balance—offering structured resource paths, semantic HTTP verbs, and unambiguous status codes—without the implementation overhead of runtime hypermedia engine discovery.
