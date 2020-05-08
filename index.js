const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const dotenv = require('dotenv');
const request = require('request-promise');
const md5 = require('md5');
const moment = require("moment");

dotenv.config();

const app = express();
const port = process.env.PORT;

app.use(bodyParser.json({limit:'50mb'}));
app.use(bodyParser.urlencoded({ limit:'50mb',extended: true }));

app.use('/labels',express.static('labels'));

creds = {};

// Functions
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
    let params = `{"email":"zuki@ecom.co.za"}`;

    let res = await sendRequest({class:"Auth",method:"getSalt",params});

    if(res.errorcode === 0){
        return res.results[0].salt;
    } else {
        return false;
    }
}

async function getSecureToken(salt) {
    let params = `{"email":"zuki@ecom.co.za","password":"${md5(process.env.PPERFECT_PASSWORD+salt)}"}`;

    let res = await sendRequest({class:"Auth",method:"getSecureToken",params});

    if(res.errorcode === 0){
        return res.results[0].token_id;
    } else {
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

// API Requests
app.get('/', async (req, res) => {
    let creds = await authenticate();

    return res.send('Shop');
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
    let {orderID} = req.query;

    let creds = await authenticate();

    let quotesParams = {},
        place = {},
        placesByNameParams = {},
        placesByPostcodeParams = {};

    let endpoint = `https://zuki-pet.myshopify.com/admin/api/2020-04/orders/${orderID}.json`;

    let response = await request({
        uri:endpoint,
        headers: {
            "X-Shopify-Access-Token": "0033747428b08917c69366b5e9e1c229"
        },
        json: true
    });

    let order = response.order;
    
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

    if(getPlacesByName.results){
        place = getPlacesByName.results[0];
    } else if(getPlacesByPostcode.results[0]){
        place = getPlacesByPostcode.results[0]
    } else {
        return res.send(400);
    }

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

app.get('/updateQuotes', async (req, res) => {
    
    let {quoteNo, selectedRate} = req.query;

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

app.get('/createLabel', async (req, res) => {
    
    let {quoteNo, selectedDate} = req.query;

    let creds = await authenticate();

    let quoteToCollectionParams = {
        "quoteno": quoteNo,
        "specinstruction":"special instructions",
        "starttime":"11:00",
        "endtime":"17:00",
        "quoteCollectionDate":moment(selectedDate,"YYYY-MM-DD").format("MM/DD/YYYY"),
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

    fs.writeFile(`labels/label-${quoteNo}.pdf`, binaryData, "binary", function(err) {
        console.log(err); // writes out file without error, but it's not a valid image
    });

    return res.send(collection);
});

app.listen(port, () => console.log(`Globeflight Postmen app listening at http://localhost:${port}`));