var cache = []


// reconstruct a URL for the chrome API
function getUrl(cookie) {
  var newUrl =  "http" + (cookie.secure ? "s" : "") + "://" + cookie.domain + cookie.path;
  console.log(newUrl);
  return newUrl;
}


// non-host-only cookies are returned with a "." before the (sub)domain, clean this up for URL construction
function cleanDomain(domain) {
  x = domain;
  if (x.startsWith(".")) { x = x.slice(1,x.length) }
  console.log("domain was " + domain + " now returning as " + x);
  return x;

}

// api wrapper for cookie deletion
function deleteCookie(cookie) {
  var urlMatch = getUrl(cookie);
  console.log("called to delete cookie from " + urlMatch);
  chrome.cookies.remove({"url": urlMatch, "name": cookie.name}, function(val) { 
    if (val != null) { 
      console.log(val); messageToWindow("deleted cookie: " + cookie.name); 
    } else { messageToWindow("unable to delete cookie: " + cookie.name); }});  
}

// go from datestring -> milliseconds -> epoch seconds
function toDate(dateString) {
  if (dateString == "") {
    return undefined;
  } else {
    try {
      var intVal = new Date(dateString).valueOf();
      return intVal / 1000
    } catch (error) {
      console.log(error);
      return undefined;
    }
  }
}


function createCookie(name, domain, value, path, sameSite, expirationDate, secure , httpOnly, originalCookie, successCallback ) {
 if (originalCookie != undefined) {
    deleteCookie(originalCookie);
  }

if (sameSite == "") {
  sameSite = "unspecified";
}

 payload = {
   "url": getUrl({"secure": secure, "domain": cleanDomain(domain), "path": path}),
   "name": name,
   "value": value,
   // "domain": domain,
   "path": path,
   "secure": secure,
   "httpOnly": httpOnly,
   "sameSite": sameSite,
   "expirationDate": toDate(expirationDate)
 }

 // handle funny chrome api issue with leading . being forced if domain is specified (https://groups.google.com/a/chromium.org/forum/#!topic/chromium-extensions/9K5Auvrilbo)
 // here we use the .sub.tld convention to qualify non-host-only domain cookies
if (domain.startsWith(".")) {
  payload["domain"] = domain
}

  chrome.cookies.set(payload, function(val) { 
    if (val != null ) {
      console.log(val); messageToWindow("saved cookie " + name); 
      if (successCallback != undefined) {
        successCallback();  
      }
      
  } else {
    console.log(chrome.runtime.lastError);
    messageToWindow("unable to save cookie " + name); 
    

    // attempt to restore original cookie in a callback
    if (originalCookie != undefined) {
      var op = {
        "url": getUrl({"secure": originalCookie.secure, "domain": cleanDomain(originalCookie.domain), "path": originalCookie.path}),
       "name": originalCookie.name,
       "value": originalCookie.value,
       // "domain": domain,
       "path": originalCookie.path,
       "secure": originalCookie.secure,
       "httpOnly": originalCookie.httpOnly,
       "sameSite": originalCookie.sameSite,
       "expirationDate": originalCookie.expirationDate
      };

      // also need to handle non-host-only settings on callback
      if (originalCookie.domain.startsWith(".")) {
        op["domain"] = originalCookie.domain;
      }


      chrome.cookies.set(op, function(val) { console.log(val); messageToWindow("attempted to restore cookie " + name); onChangeState();});
    }
  }; });
}


// flash a message to the top of the extension
function messageToWindow(message) {
  document.querySelector("#status").innerText = document.querySelector("#status").innerText + message + "\n";
  document.querySelector("#status").hidden = false;
  setTimeout(function() { document.querySelector("#status").innerText=""; document.querySelector("#status").setAttribute("hidden",true);}, 1500);
}


// convenience function to pre-populate the extension with the domain of the current tab
function populateCurrentDomain() {
	chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
  		try {
        var tab = tabs[0];
  		  var url = new URL(tab.url);
  		  var domain = url.hostname;
  		  console.log("found domain: " + domain);
        document.querySelector("#domainFilter").value = domain;
        lookupCookies()
      } catch(error) {
        console.log(error)
      }
	})
}


// remove all rows from the main cookie table
function clearCookies() {
  var count = 0;
  var table = document.querySelector("#cookiebox");
  while (table.rows.length > 0) {
    table.deleteRow(table.rows.length - 1);
    count += 1
  }
}

// allow a users to delete all cookies visible (in the cache)
function deleteAllCookies() {
  if (window.confirm("delete all cookies visible?")) {
    for (var i in cache) {
      deleteCookie(cache[i]);
    }
    onChangeState();
  }
}


// expose section to create a new cookie
function newCookieVisible() {
  console.log("making cookie section visible");
  document.querySelector("#cookiecreatediv").hidden = false;
}


// reset all fields in the 'new cookie' section
function cleanNewCookieFields() {
    document.querySelector("#newcookiename").value = "";
    document.querySelector("#newcookiedomain").value = "";
    document.querySelector("#newcookievalue").value = "";
    document.querySelector("#newcookiepath" ).value = "";
    document.querySelector("#newcookieexpiration").value = "";
    document.querySelector("#newcookiesecure").checked = false;
    document.querySelector("#newcookiehttponly").checked = false;
    document.querySelector("#newcookiesamesite").value = "";
  
}


// grab the 'new cookie' section and submit values to chrome api - includes a callback which clears the 'new cookie' section
function createNewCookie() {

  var newName = document.querySelector("#newcookiename").value;
  var newDomain =  document.querySelector("#newcookiedomain").value;
  var newValue =  document.querySelector("#newcookievalue").value;
  var newPath =  document.querySelector("#newcookiepath" ).value;
  var newExpirationDate =  document.querySelector("#newcookieexpiration").value;
  var newSecure =  document.querySelector("#newcookiesecure").checked;
  var newHttpOnly =  document.querySelector("#newcookiehttponly").checked;
  var newSameSite =  document.querySelector("#newcookiesamesite").value;

  createCookie(newName, newDomain, newValue, newPath, newSameSite, newExpirationDate, newSecure, newHttpOnly, undefined, function() {
    document.querySelector("#cookiecreatediv").hidden = true;
    cleanNewCookieFields();
    onChangeState();
  }) ;

}
  


/* 
This function is a monster, and should be refactored

It takes a cookie and adds it to the main table, laying 
out the values, ids and callbacks for actions taken 
on the cookie post rendering
*/

function cookieToHtml(cookie, rownum) {
    
    var cols = [cookie.name, cookie.domain, cookie.value, cookie.path, cookie.sameSite, cookie.expirationDate];
    var colids = ['name', 'domain', 'value', 'path', 'samesite', 'expiration'];
        
    var boolCols = [cookie.secure, cookie.httpOnly];
    var boolColids = ['secure', 'httponly'];

    var table = document.querySelector("#cookiebox");
      
      for (var i in cols) {

        var row = table.insertRow(-1);
        var cell = row.insertCell(-1);
        
        var label = document.createElement("div");
        label.innerText = colids[i];
        cell.appendChild(label);
      	
        var cell = row.insertCell(-1);
      	
        var div = document.createElement("div");
      	div.setAttribute("class", "flex-container");

      	var input = document.createElement("textarea");
      	input.setAttribute("class","fill-width");
      	input.setAttribute("rows", 1);
        input.setAttribute("id", colids[i]+rownum)
       

        // handle expiration
        if (colids[i] == 'expiration') {
          if (cols[i] == undefined) {
            input.value = "";  
          } else {
            input.value = new Date(cols[i]*1000).toISOString();
          }
        } else {
          input.value = cols[i];  
        }
      	
      	cell.appendChild(div)
      	div.appendChild(input);
        

        if (colids[i] == 'value') {
          

          var origValue = cols[i];


          // reset button
          var resetButton = document.createElement("button")
          resetButton.innerText = "\u{21BB}";
          resetButton.setAttribute("class", "tinybutton");
          resetButton.onclick = function() {
              document.querySelector("#value" + rownum).value = origValue;
          }
          

          // url encode
          var urlEncodeButton = document.createElement("button")
          urlEncodeButton.innerText = "\u{2192}url";
          urlEncodeButton.setAttribute("class", "tinybutton");

          urlEncodeButton.onclick = function() {
              var currentValue = document.querySelector("#value" + rownum).value;
              try {
                document.querySelector("#value" + rownum).value = encodeURIComponent(currentValue)
              } catch (exception) {
                messageToWindow("unable to url encode " + currentValue.slice(0,10) + "...");
              }
          }
          

          // url decode
          var urlDecodeButton = document.createElement("button")
          urlDecodeButton.innerText = "\u{2190}url";
          urlDecodeButton.setAttribute("class", "tinybutton");

          urlDecodeButton.onclick = function() {
              var currentValue = document.querySelector("#value" + rownum).value;
              try {
                document.querySelector("#value" + rownum).value = decodeURIComponent(currentValue)
              } catch (exception) {
                messageToWindow("unable to url decode " + currentValue.slice(0,10) + "...");
              }
          }
          
          // from base64
          var decodeButton = document.createElement("button")
          decodeButton.innerText = "\u{2190}b64";
          decodeButton.setAttribute("class", "tinybutton");


          decodeButton.onclick = function() {
              var currentValue = document.querySelector("#value" + rownum).value;
              try {
                document.querySelector("#value" + rownum).value = atob(currentValue)
              } catch (exception) {
                messageToWindow("unable to base64 decode " + currentValue.slice(0,10) + "...");
              }
          }
          
          // to base64
          var encodeButton = document.createElement("button")
          encodeButton.innerText ="\u{2192}b64";
          encodeButton.setAttribute("class", "tinybutton");


          encodeButton.onclick = function() {
              var currentValue = document.querySelector("#value" + rownum).value;
              try {
                document.querySelector("#value" + rownum).value = btoa(currentValue)
              } catch (exception) {
                messageToWindow("unable to base64 encode " + currentValue.slice(0,10) + "...");
              }
          }

          cell.appendChild(resetButton);
          cell.appendChild(encodeButton);
          cell.appendChild(decodeButton);
          cell.appendChild(urlEncodeButton);
          cell.appendChild(urlDecodeButton);
          
          input.value = cols[i];  

        }
      }

      // new row for booleans:
      var row = table.insertRow(-1);
      var cell = row.insertCell(-1);
      

      var label = document.createElement("div")
      label.innerText = "flags";
      cell.appendChild(label);
      var cell = row.insertCell(-1);
      

      for (var i in boolCols) {
        
        var label = document.createElement("label")
        label.setAttribute("class", "checkbox-inline");
        label.setAttribute("for", boolColids[i]);
        label.innerText = boolColids[i]
        cell.appendChild(label);
      
        var input = document.createElement("input");
        input.type="checkbox";
        input.setAttribute("id", boolColids[i]+rownum);
        if (boolCols[i]) {
          input.setAttribute("checked", true);
        }
        cell.appendChild(input);
      }
      
      var row = table.insertRow(-1);
      var cell = row.insertCell(-1);
      
      // delete button
      var cell = row.insertCell(-1);
      var div = document.createElement("div");
      div.setAttribute("class","flex-container");

      var deleteButton = document.createElement("button");
      deleteButton.innerText = "\u{1f5d1}";
      deleteButton.onclick = function() {
        deleteCookie(cookie);
        onChangeState();
      }
      div.appendChild(deleteButton);


      // save button
      var saveButton = document.createElement("button");
      saveButton.innerText = "\u{1F4BE}";
      saveButton.onclick = function() {
        newName = document.querySelector("#name" + rownum).value;
        newDomain =  document.querySelector("#domain" + rownum).value;
        newValue =  document.querySelector("#value" + rownum).value;
        newPath =  document.querySelector("#path" + rownum).value;
        newExpirationDate =  document.querySelector("#expiration" + rownum).value;
        newSecure =  document.querySelector("#secure" + rownum).checked;
        newHttpOnly =  document.querySelector("#httponly" + rownum).checked;
        newSameSite =  document.querySelector("#samesite" + rownum).value;
        createCookie(newName, newDomain, newValue, newPath, newSameSite, newExpirationDate, newSecure, newHttpOnly, cookie ) ;
        onChangeState();
      }
      div.appendChild(saveButton);
      cell.appendChild(div);


      var row = table.insertRow(-1);
      var cell = row.insertCell(-1);
      
      var cell = row.insertCell(-1);
      var hr = document.createElement("hr")
      cell.appendChild(hr);
    
}


function renderCookie(cookie, rownum) {
   cookieToHtml(cookie, rownum)
}


// convenience string matcher
function isFilterMatch(testvalue, filter) {
	// console.log("testing " + testvalue + " against " + filter)
	if (testvalue == undefined || filter == undefined) {
		return false
	}

	return testvalue.toLowerCase().indexOf(filter.toLowerCase()) >= 0;
}

// allows for the cookie+value filter to operate on cached responses from the chrome api
function renderCookiesFromCache(predicate) {
  
  var cookieCount = 0;
 
  clearCookies();
  for (var i in cache) {
    if (predicate != undefined && predicate != "") {
     if (isFilterMatch(cache[i].value, predicate) || isFilterMatch(cache[i].name, predicate)) {
        renderCookie(cache[i], i);  cookieCount += 1;
      } 
    } else {
      renderCookie(cache[i], i);
      cookieCount += 1;
   }
  }

  if (cookieCount == 0) {
    messageToWindow("no cookies found for this scope + filter");
  }

  document.querySelector("#filtercount").innerText =  cookieCount +  " cookie(s) matched filter\n";

}


// populates the cache with the response from the chrome api on a get call
function ingestWithDomainFilter(cookies, domainFilter) {
 cache = []
 var cookieCount = 0;
 var subCookieCount = 0;

  for (var i in cookies) {

      if ( cookies[i].domain.toLowerCase() == domainFilter.toLowerCase() || cookies[i].domain.toLowerCase() == "." + domainFilter.toLowerCase()) {
        cache.push(cookies[i])

        cookieCount += 1;
        subCookieCount += 1;
      }
       else if (cookies[i].domain.startsWith(".") && isFilterMatch(domainFilter, cookies[i].domain)) {
          cache.push(cookies[i])
          cookieCount += 1;


      } else if (domainFilter.startsWith(".") && isFilterMatch(cookies[i].domain, domainFilter) ) {
          cache.push(cookies[i])
          cookieCount += 1;
      }
  
    }

   document.querySelector("#cookiecount").innerText = "found " + cookieCount + " cookie(s) in scope\n" +  "found " + subCookieCount + " matching subdomain\n";
   renderCookiesFromCache(document.querySelector('#cookieFilter').value);
}


// sort by domain first, then name descending order
function cookieSort(cookieArray) {
  cookieArray.sort((a, b) => (a.domain + a.name> b.domain + b.name) ? -1 : 1)
}

// re-render main parts of window with a fresh cookie lookup
function onChangeState() {
	clearCookies();
  lookupCookies();
}

// api wrapper to get all cookies and pass them onto caching filter
function lookupCookies() {
	filter = document.querySelector("#domainFilter").value
	chrome.cookies.getAll({}, function(cookies) {
      cookieSort(cookies)
   		ingestWithDomainFilter(cookies, filter) 
  });
}

