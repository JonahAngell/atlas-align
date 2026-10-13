
package authz

default allow := false

allow if {
  input.request.method == "GET"
  input.request.path == "/"
}

allow if {
  input.user.authenticated == true
  not startswith(input.request.path, "/api/admin/")
}

allow if {
  input.user.authenticated == true
  input.request.method == "GET"
  startswith(input.request.path, "/api/admin/")
  input.user.roles[_] == "atlas-align-admin"
}

allow if {
  input.user.authenticated == true
  input.request.method == "POST"
  input.request.path == "/api/admin/field-library/replace"
  input.user.roles[_] == "atlas-align-admin"
}


allow if { input.user.authenticated == true; startswith(input.request.path, "/api/admin/audits/"); input.user.roles[_] == "admin" }
