const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const dotenv = require('dotenv');
const request = require('request-promise');
const md5 = require('md5');
const moment = require("moment");
const cors = require('cors');

dotenv.config();

const app = express();
const port = process.env.PORT;

app.use(bodyParser.json({limit:'50mb'}));
app.use(bodyParser.urlencoded({ limit:'50mb',extended: true }));
app.use(cors())
app.use('/labels',express.static('labels'));
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    next();
});

let mdsHeaders = {
    "X-App-Name": "Thump Shipping",
    "X-App-Version": "0.2.1",
    "X-App-Host": ".NET Framework 4.8",
    "X-App-Lang": "C#",
    "Content-Type": "application/json",
    "Accept": "application/json",
}

// Functions GlobeFlight
async function sendRequest(qs) {
    let options = {
        method:'GET',
        uri:process.env.PPERFECT_BASE_URL,
        qs,
        json: true,
        // resolveWithFullResponse: true
    };

    let response = await request(options);

    return response;
}

async function getSalt() {
    try {
        let params = `{"email":"${process.env.PPERFECT_USERNAME}"}`;

        let res = await sendRequest({class:"Auth",method:"getSalt",params});

        if(res.errorcode === 0){
            return res.results[0].salt;
        } else {
            return false;
        }
    } catch (error) {
        console.log(error);
        return false;
    }
}

async function getSecureToken(salt) {
    try {
        let params = `{"email":"${process.env.PPERFECT_USERNAME}","password":"${md5(process.env.PPERFECT_PASSWORD+salt)}"}`;

        let res = await sendRequest({class:"Auth",method:"getSecureToken",params});

        if(res.errorcode === 0){
            return res.results[0].token_id;
        } else {
            return false;
        }
    } catch (error) {
        console.log(error);
        return false;
    }
}

async function authenticate() {
    let salt = "",
        token_id = "";

    if(!salt)
        salt = await getSalt();

    if(!token_id)
        token_id = await getSecureToken(salt);

    return {salt, token_id};
}

// MDS Function
async function mdsLogin() {
    let res = await request({
            method: "POST",
            uri:`https://api.collivery.co.za/v3/login`,
            headers: mdsHeaders,
            body: {
                "email":"demo@collivery.co.za",
                "password":"demo"
            },
            json: true,

        }
    );

    return res;
}

// Shopify Functions
async function getOrder(orderID) { 
    let endpoint = `https://zuki-pet.myshopify.com/admin/api/2020-04/orders/${orderID}.json`;

    let response = await request({
        uri:endpoint,
        headers: {
            "X-Shopify-Access-Token": "0033747428b08917c69366b5e9e1c229"
        },
        json: true
    });

    return response.order;
}
// API Requests
app.get('/', async (req, res) => {
    let creds = await authenticate();

    let statusCode = creds ? 200 : 401;

    return res.sendStatus(statusCode);
});

app.get('/requestQoutes', async (req, res) => {
    let creds = await authenticate();

    let quotesParams = {},
        updateServiceParams = {},
        quoteToWaybillParams = {},
        quoteToCollectionParams = {};

    quotesParams.details = {
        "specinstruction":"testing",
        "reference":"testing",
        // Origin Details
        "origperadd1":"Chris Irwin",
        "origperadd2":"Unit 6A",
        "origperadd3":"APD Industrial Park 1",
        "origperadd4":"Elsecar Street",
        "origperphone":"+27726218581",
        "origpercell":"+27726218581",
        "origplace":"2016",
        "origtown":"KYA SANDS",
        "origpers":"TESTCUSTOMER",
        "origpercontact":"Chris Irwin",
        "origperpcode":"2125",
        // Destination Details
        "destperadd1":"adfa",
        "destperadd2":"adfa",
        "destperadd3":"Johannesburg",
        "destperadd4":"Address line 4",
        "destperphone":"+27726218581",
        "destpercell":"+27726218581",
        "destplace":"1677",
        "desttown":"BRAAMFONTEIN , Johannesburg",
        "destpers":"TESTCUSTOMER",
        "destpercontact":"Chris irwin",
        "destperpcode":"2001",
    };

    quotesParams.contents = [
        {
            item: 1,
            desc: 'this is a test',
            pieces: 1,
            dim1: 1,
            dim2: 1,
            dim3: 1,
            actmass: 1
        }, {
            item: 2,
            desc: 'ths is another test',
            pieces: 1,
            dim1: 1,
            dim2: 1,
            dim3: 1,
            actmass: 1
        }
    ];

    let quotes = await sendRequest({
        "class":"Quote",
        "method":"requestQuote",
        "params":JSON.stringify(quotesParams),
        "token_id":creds.token_id
    });

    updateServiceParams = {
        "quoteno":quotes.results[0].quoteno,
        "service":quotes.results[0].rates[0].service
    };

    let updateQuotes = await sendRequest({
        "class":"Quote",
        "method":"updateService",
        "params":JSON.stringify(updateServiceParams),
        "token_id":creds.token_id
    });

    quoteToWaybillParams = {
        "quoteno": updateQuotes.results[0].quoteno,
        "specins":"special instructions",
        "printWaybill":"1",
        "printLabels":"1"
    };

    let waybill = await sendRequest({
        "class":"Quote",
        "method":"quoteToWaybill",
        "params":JSON.stringify(quoteToWaybillParams),
        "token_id":creds.token_id
    });

    quoteToCollectionParams = {
        "quoteno": updateQuotes.results[0].quoteno,
        "specinstruction":"special instructions",
        "starttime":"11:09",
        "endtime":"17:00",
        "quoteCollectionDate":"05/04/2020",
        "notes":"some notes here",
        "printWaybill":"1",
        "printLabels":"1"
    };

    let collection = await sendRequest({
        "class":"Collection",
        "method":"quoteToCollection",
        "params":JSON.stringify(quoteToCollectionParams),
        "token_id":creds.token_id
    });

    let binaryData = new Buffer(collection.results[0].labelsBase64, 'base64').toString('binary');

    fs.writeFile("label.pdf", binaryData, "binary", function(err) {
        console.log(err); // writes out file without error, but it's not a valid image
    });

    return res.send({collection});
});

app.get('/getRates', async (req, res) => {
    let {orderID,length,width,height,weights} = req.query;

    let creds = await authenticate();

    let quotesParams = {},
        place = {},
        placesByNameParams = {},
        placesByPostcodeParams = {};

    let order = await getOrder(orderID);
    
    placesByPostcodeParams = {"postcode":`${order.shipping_address.zip}`}
    placesByNameParams = {"name":`${order.shipping_address.city}`}

    let getPlacesByName = await sendRequest({
        "class":"Quote",
        "method":"getPlacesByName",
        "params":JSON.stringify(placesByNameParams),
        "token_id":creds.token_id
    });

    let getPlacesByPostcode = await sendRequest({
        "class":"Quote",
        "method":"getPlacesByPostcode",
        "params":JSON.stringify(placesByPostcodeParams),
        "token_id":creds.token_id
    });

    if(getPlacesByName.results[0]){
        place = getPlacesByName.results[0];
    } else if(getPlacesByPostcode.results[0]){
        place = getPlacesByPostcode.results[0]
    } else {
        return res.sendStatus(400);
    }

    quotesParams.details = {
        "specinstruction":"testing",
        "reference":"testing",
        // Origin Details
        "origperadd1":"Zuki Pet",
        "origperadd2":"Unit 6A",
        "origperadd3":"APD Industrial Park 1",
        "origperadd4":"Elsecar Street",
        "origperphone":"+27726218581",
        "origpercell":"+27726218581",
        "origplace":"2016",
        "origtown":"KYA SANDS",
        "origpers":"TESTCUSTOMER",
        "origpercontact":"Chris Irwin",
        "origperpcode":"2125",
        // Destination Details
        "destperadd1":order.shipping_address.address1,
        "destperadd2":order.shipping_address.address2,
        "destperadd3":"",
        "destperadd4":"",
        "destperphone":order.shipping_address.phone,
        "destpercell":order.shipping_address.phone,
        "destplace":place.place,
        "desttown":place.town,
        "destpers":"TESTCUSTOMER",
        "destpercontact":order.shipping_address.name,
        "destperpcode":place.pcode,
    };

    quotesParams.contents = [];

    order.line_items.forEach((item, index) => {
        quotesParams.contents.push({
            item: index+1/* item.quantity */,
            desc: item.name,
            pieces: item.quantity,
            dim1: 1,
            dim2: 1,
            dim3: 1,
            actmass: item.grams ? item.grams/1000 : 1
        });
    });

    let quotes = await sendRequest({
        "class":"Quote",
        "method":"requestQuote",
        "params":JSON.stringify(quotesParams),
        "token_id":creds.token_id
    });

    return res.send(quotes.results[0]);
});

app.post('/updateQuotes', async (req, res) => {
    let {quoteNo, selectedRate,length,width,height,weights} = req.body;

    let updateServiceParams = {
        "quoteno":quoteNo,
        "service":selectedRate
    };

    let creds = await authenticate();

    let updateQuotes = await sendRequest({
        "class":"Quote",
        "method":"updateService",
        "params":JSON.stringify(updateServiceParams),
        "token_id":creds.token_id
    });

    return res.send(updateQuotes.results[0]);
});

app.post('/createLabel', async (req, res) => {
    
    let {quoteNo, selectedDate} = req.body;

    let creds = await authenticate();

    let quoteToCollectionParams = {
        "quoteno": quoteNo,
        "specinstruction":"testing",
        "starttime":"14:00",
        "endtime":"17:00",
        "quoteCollectionDate":moment(selectedDate,"YYYY-MM-DD").format("MM/DD/YYYY"),
        "notes":"testing",
        "printWaybill":"1",
        "printLabels":"1"
    };

    try {

        let collection = await sendRequest({
            "class":"Collection",
            "method":"quoteToCollection",
            "params":JSON.stringify(quoteToCollectionParams),
            "token_id":creds.token_id
        });

        if(collection.errorcode === 0) {
            let binaryData = new Buffer(collection.results[0].labelsBase64, 'base64').toString('binary');

            fs.writeFile(`labels/label-${quoteNo}.pdf`, binaryData, "binary", function(err) {
                if(err) {
                    console.log(err); // writes out file without error, but it's not a valid image
                    res.sendStatus(401);
                }
                
                return;
                
            });

            return res.send(collection);
        } else {
            res.sendStatus(401);
        }
    } catch(error) {
        console.log(error);
        res.sendStatus(401);
    }
});

app.get('/getMDSRates', async (req, res) => {
    let {orderID} = req.query;

    let selectedDate = "2020-05-11";

    let loginData = await mdsLogin();

    let order = await getOrder(orderID);

    let getDeliverySuburb = await request({
        uri: `https://api.collivery.co.za/v3/suburbs?api_token=${loginData.data.api_token}&country=ZAF&search=${order.shipping_address.city}`,
        method: "GET",
        headers: mdsHeaders,
        json: true,
    });

    let response = await request({
        uri: `https://api.collivery.co.za/v3/quote?api_token=${loginData.data.api_token}`,
        method: "POST",
        headers: mdsHeaders,
        json: true,
        body: {
            "services": [
                1,2,3,5
            ],
            "parcels": [
                {
                    "length": 21.5,
                    "width": 10,
                    "height": 5.5,
                    "weight": 5.2,
                    "quantity": order.line_items.length
                }
            ],
            "collection_town": 147,
            "delivery_town": getDeliverySuburb.data[0].town.id || 147,
            "collection_location_type": 1,
            "delivery_location_type": 5,
            "collection_time": selectedDate+" 12:00",
            "delivery_time": selectedDate+" 15:00",
            "exclude_weekend": true,
            "risk_cover": false,
            "rica": false,
            "consignee": true,
            "sms_tracking": false
        }
    });
    res.send(response.data);
});

app.get('/createMDSLabel', async (req, res) => {
    let {service_type, orderID} = req.query;

    let selectedDate = "2020-05-11";

    let loginData = await mdsLogin();

    let order = await getOrder(orderID);

    let getDeliverySuburb = await request({
        uri: `https://api.collivery.co.za/v3/suburbs?api_token=${loginData.data.api_token}&country=ZAF&search=${order.shipping_address.city}`,
        method: "GET",
        headers: mdsHeaders,
        json: true,
    });

    let response = await request({
        uri: `https://api.collivery.co.za/v3/waybill?api_token=${loginData.data.api_token}`,
        method: "POST",
        headers: mdsHeaders,
        json: true,
        body: {
            "services": service_type,
            "parcels": [
                {
                    "length": 21.5,
                    "width": 10,
                    "height": 5.5,
                    "weight": 5.2,
                    "quantity": order.line_items.length
                }
            ],
            "collection_address": 952,
            "collection_contact": 593,
            "delivery_address": 955,
            "delivery_contact": 596,
            "collection_time": selectedDate+" 12:00",
            "delivery_time": selectedDate+" 15:00",
            "exclude_weekend": true,
            "risk_cover": false,
            "rica": false,
            "consignee": true,
            "sms_tracking": false
        }
    });

    /* let waybillID = response.data.id;

    let wayBillDocument = await request({
        uri: `https://api.collivery.co.za/v3/waybill_documents/${waybillID}?api_token=${loginData.data.api_token}`,
        method: "GET",
        headers: mdsHeaders,
        json: true,
    });

    let binaryData = new Buffer(wayBillDocument.data.image, 'base64').toString('binary');

    fs.writeFile(`labels/label-${waybillID}.pdf`, binaryData, "binary", function(err) {
        console.log(err); // writes out file without error, but it's not a valid image
    }); */

    res.send(response.data);
});

app.listen(port, () => console.log(`Globeflight Postmen app listening at http://localhost:${port}`));