var Service, Characteristic;
var request = require("request");
var axios = require("axios");

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    homebridge.registerAccessory("homebridge-nexia-thermostat", "NexiaThermostat", NexiaThermostat);
};


function NexiaThermostat(log, config, api) {
    this.log = log;
    this.name = config.name;
    this.apiroute = config.apiroute;
    this.houseId = config.houseId;
    this.thermostatIndex = config.thermostatIndex;
    this.xMobileId = config.xMobileId;
    this.xApiKey = config.xApiKey;
    this.manufacturer = config.manufacturer;
    this.model = config.model;
    this.serialNumber = config.serialNumber;
	this.pollInterval = config.pollInterval || 60;

    this.service = new Service.Thermostat(this.name);
    this.humidityService = new Service.HumiditySensor(this.name);

    this.coolingThreshold=0;

	//
	this.zoneModeMap = new Map();
	this.zoneModeMap.set(Characteristic.TargetHeatingCoolingState.OFF, "OFF");
	this.zoneModeMap.set(Characteristic.TargetHeatingCoolingState.HEAT, "HEAT");
	this.zoneModeMap.set(Characteristic.TargetHeatingCoolingState.COOL, "COOL");
	this.zoneModeMap.set(Characteristic.TargetHeatingCoolingState.AUTO, "AUTO");

    //
    this.scaleMap = new Map();
    this.scaleMap.set("f", Characteristic.TemperatureDisplayUnits.FAHRENHEIT);
    this.scaleMap.set("c", Characteristic.TemperatureDisplayUnits.CELSIUS);

    //
    this.characteristicMap = new Map();
    this.characteristicMap.set("HEAT", Characteristic.CurrentHeatingCoolingState.HEAT);
    this.characteristicMap.set("COOL", Characteristic.CurrentHeatingCoolingState.COOL);
    this.characteristicMap.set("OFF", Characteristic.CurrentHeatingCoolingState.OFF);


}

NexiaThermostat.prototype = {
    //Start
    identify: function(callback) {
        this.log("Identify requested!");
        callback(null);
    },
    getDefaultInfo: async function() {
        const url = this.apiroute + "houses/" + this.houseId;

        try {
            const res=await axios.get(url, {
                    headers: {
                        "Content-Type": "application/json",
                        "X-MobileId": this.xMobileId,
                        "X-ApiKey": this.xApiKey
                    }
                }
            );

            return res.data.result._links.child[0].data.items[this.thermostatIndex];
        } catch(e) {
            this.log(e.message);

            return false;
        }
    },
    getMappedMode: function(data) {

        const rawMode = data.zones[0].current_zone_mode;
        let mappedMode = this.characteristicMap.get(rawMode);

        const rawTemperature = data.zones[0].temperature;
        const rawHeatingSetPoint = data.zones[0].heating_setpoint;
        const rawCoolingSetPoint = data.zones[0].cooling_setpoint;

        if (rawMode == 'AUTO') { //Special handling for auto
            mappedMode = Characteristic.CurrentHeatingCoolingState.HEAT; //default to heat for now.
            if (rawTemperature < rawHeatingSetPoint) {
                mappedMode = Characteristic.CurrentHeatingCoolingState.HEAT;
            }
            if (rawTemperature > rawCoolingSetPoint) {
                mappedMode = Characteristic.CurrentHeatingCoolingState.COOL;
            }
        }
        
        return mappedMode;
    },
    // Required
    getCurrentHeatingCoolingState: async function(callback) {
        var requestUrl = this.apiroute + "houses/" + this.houseId;

        this.log("getCurrentHeatingCoolingState from: %s", requestUrl);


        const data=await this.getDefaultInfo();

        if(data!==false) {

            const mappedMode=this.getMappedMode(data);

            callback(null, mappedMode);

        } else {
            callback(null);
        }
    },
    parseMode:function(rawState) {
        var characteristic = Characteristic.TargetHeatingCoolingState.OFF;
        if (rawState === "COOL") {
            characteristic = Characteristic.TargetHeatingCoolingState.COOL;
        } else if (rawState === "HEAT") {
            characteristic = Characteristic.TargetHeatingCoolingState.HEAT;
        } else if (rawState === "AUTO") {
            characteristic = Characteristic.TargetHeatingCoolingState.AUTO;
        }        

        return characteristic;
    },
    getTargetHeatingCoolingState: async function(callback) {
        this.log("getTargetHeatingCoolingState");

        const data=await this.getDefaultInfo();

        if(data!==false) {
            const characteristic=this.parseMode(data.zones[0].current_zone_mode);

            this.log("getTargetHeatingCoolingState: %s, %s", characteristic, data.zones[0].current_zone_mode);

            callback(null, characteristic);            
        } else {
            callback(null);
        }
        // request.get({
        //     url: this.apiroute + "houses/" + this.houseId,
        //     headers: {
        //         "Content-Type": "application/json",
        //         "X-MobileId": this.xMobileId,
        //         "X-ApiKey": this.xApiKey
        //     }
        // }, function(err, response, body) {
        //     if (!err && response.statusCode == 200) {
        //         // this.log("response success");
        //         var data = JSON.parse(body);
        //         var rawState = data.result._links.child[0].data.items[this.thermostatIndex].zones[0].current_zone_mode;

        //         var characteristic = Characteristic.TargetHeatingCoolingState.OFF;
        //         if (rawState === "COOL") {
        //             characteristic = Characteristic.TargetHeatingCoolingState.COOL;
        //         } else if (rawState === "HEAT") {
        //             characteristic = Characteristic.TargetHeatingCoolingState.HEAT;
        //         } else if (rawState === "AUTO") {
        //             characteristic = Characteristic.TargetHeatingCoolingState.AUTO;
        //         }

        //         this.log("getTargetHeatingCoolingState: %s, %s", characteristic, rawState);
        //         callback(null, characteristic);
        //     } else {
        //         this.log("Error getting TargetHeatingCoolingState: %s", err);
        //         callback(err);
        //     }
        // }.bind(this));
    },
    setTargetHeatingCoolingState: function(value, callback) {

		this.log("setTargetHeatingCoolingState : %s",value);

        request.get({
            url: this.apiroute + "houses/" + this.houseId,
            headers: {
                "Content-Type": "application/json",
                "X-MobileId": this.xMobileId,
                "X-ApiKey": this.xApiKey
            }
        }, function(err, response, body) {

            if (!err && response.statusCode == 200) {

                var data = JSON.parse(body);

                var rawThermostatMode = data.result._links.child[0].data.items[this.thermostatIndex].zones[0].features.find((e) => e.name == "thermostat_mode");
				var zoneModeUrl = rawThermostatMode.actions.update_thermostat_mode.href;

				var newRawValue=this.zoneModeMap.get(value);

                request.post({
                    url:zoneModeUrl,
                    headers: {
                        "Content-Type": "application/json",
                        "X-MobileId": this.xMobileId,
                        "X-ApiKey": this.xApiKey
                    },
                    json:{value:newRawValue}
                }, function(err2, res2, body2) {

                    this.log(body2);
                    if(body2 && body2.success===true) {
                        if(body2.result.current_zone_mode==='COOL') {
                            this.service.updateCharacteristic(Characteristic.TargetTemperature,this.ftoc(body2.result.cooling_setpoint));
                        } else if(body2.result.current_zone_mode==='HEAT') {
                            this.service.updateCharacteristic(Characteristic.TargetTemperature,this.ftoc(body2.result.heating_setpoint));
                        } else if(body2.result.current_zone_mode==='AUTO') {
                            this.service.updateCharacteristic(Characteristic.CoolingThresholdTemperature,this.ftoc(body2.result.cooling_setpoint));
                            this.service.updateCharacteristic(Characteristic.HeatingThresholdTemperature,this.ftoc(body2.result.heating_setpoint));
                        }
                    }

                    callback(null);
                }.bind(this));

            } else {
                this.log("Error setting setTargetHeatingCoolingState response.statusCode: %s", response.statusCode);
                callback(err);
            }
        }.bind(this));

    },
    getCurrentTemperature: async function (callback) {
        this.log("getCurrentTemperature");

        const data=await this.getDefaultInfo();

        if(data!==false) {
            const f=data.zones[0].temperature;

            const convertedScale = this.getConvertedScale(data);
            
            let c=f;
            if(convertedScale === Characteristic.TemperatureDisplayUnits.FAHRENHEIT) {
                c = this.ftoc(c);
            }

            callback(null, c);
        } else {
            callback(null);
        }
    },
    ctof: function(c) {
        return parseInt(Math.round(c * 1.8 + 32.0));
    },
    ftoc: function(f) {
        return ((f - 32.0) / 1.8).toFixed(1);
    },
    getConvertedScale: function(data) {
        const rawThermostatFeature = data.zones[0].features.find((e) => e.name == "thermostat");
        const rawScale = rawThermostatFeature.scale;
        const convertedScale = this.scaleMap.get(rawScale);

        return convertedScale;
    },
    getTargetTemperature: async function(callback) {
        this.log("getTargetTemperature");

        const data=await this.getDefaultInfo();

        if(data!==false) {

            const convertedScale = this.getConvertedScale(data);

            const mappedMode=this.getMappedMode(data);

            let tem;

            if(mappedMode===Characteristic.CurrentHeatingCoolingState.HEAT) {
                tem=data.zones[0].heating_setpoint;
            } else {
                tem=data.zones[0].cooling_setpoint;
            }

            if(convertedScale === Characteristic.TemperatureDisplayUnits.FAHRENHEIT) {
                tem = this.ftoc(tem);
            }

            this.log("Target Temperature : %s", tem);

            callback(null, tem);
        } else {
            callback(null);
        }
    },
    getSetPointUrl: function(data) {
        const rawThermostatFeature = data.zones[0].features.find((e) => e.name == "thermostat");
        const rawThermostatMode = data.zones[0].features.find((e) => e.name == "thermostat_mode");
        const zoneModeUrl = rawThermostatMode.actions.update_thermostat_mode.href;

        let setPointUrl;
        if (rawThermostatFeature.actions.set_heat_setpoint != null) {
            setPointUrl = rawThermostatFeature.actions.set_heat_setpoint.href;
        } else if (rawThermostatFeature.actions.set_cool_setpoint != null) {
            setPointUrl = rawThermostatFeature.actions.set_cool_setpoint.href;
        } else {
            setPointUrl = zoneModeUrl.replace('zone_mode', 'setpoints');
        }

        return setPointUrl;
    },
    postPoints:async function(data, payload, callback) {
        const setPointUrl=this.getSetPointUrl(data);

        this.log("set point url : %s", setPointUrl);

        request.post({
            url:setPointUrl,
            headers: {
                "Content-Type": "application/json",
                "X-MobileId": this.xMobileId,
                "X-ApiKey": this.xApiKey
            },
            json:payload
        }, function(err2, res2, body2) {
            this.log("+++ postPoints");
            this.log(payload);
            this.log(body2);
            
            this.coolingThreshold=0;

            callback(null);
        }.bind(this));    

    },
    makePointPayload:function(data, type, value) {
        // this.log(data.zones[0]);
        const payload={
            heat:data.zones[0].heating_setpoint,
            cool:data.zones[0].cooling_setpoint,
        };

        const convertedScale = this.getConvertedScale(data);

        let tem=value;

        if(convertedScale === Characteristic.TemperatureDisplayUnits.FAHRENHEIT) {
            tem = this.ctof(tem);

            this.log("C to F : %s", tem);
        } else {
            tem = tem.toFixed(1);
        }

        payload[type]=tem;

        this.log("!!! makePointPayload");
        this.log(payload);

        return payload;
    },
    setTargetTemperature: async function(value, callback) {

        // heat or cool, not for auto
        this.log("Trigger setTargetTemperature %s", value);


        const data=await this.getDefaultInfo();

        if(data!==false) {

            const rawMode=data.zones[0].current_zone_mode;

            if(rawMode==='AUTO') {
                this.log("Ignore setTargetTemperature - AUTO");
                callback(null);
            } else {

                this.log("current mode : %s", rawMode);

                let payload={};

                const mappedMode=this.getMappedMode(data);
                if(mappedMode === Characteristic.CurrentHeatingCoolingState.HEAT) {
                    payload=this.makePointPayload(data, 'heat', value);
                } else {
                    payload=this.makePointPayload(data, 'cool', value);
                }
                        
                this.postPoints(data, payload, callback);
                // callback(null);
            }


        } else {
            callback(null);
        }


        // callback(null);
    },
    getTemperatureDisplayUnits: async function(callback) {
        this.log("getTemperatureDisplayUnits");

        const data=await this.getDefaultInfo();

        if(data!==false) {

            const rawThermostatFeature = data.zones[0].features.find((e) => e.name == "thermostat");
            const rawScale = rawThermostatFeature.scale;
            const convertedScale = this.scaleMap.get(rawScale);


            callback(null, convertedScale);
        } else {
            callback(null);
        }

    },
    setTemperatureDisplayUnits: function(value, callback) {
        callback(null);
    },

    // Optional
    getCoolingThresholdTemperature: async function(callback) {
        this.log("getCoolingThresholdTemperature");

        const data=await this.getDefaultInfo();

        if(data!==false) {
            const f=data.zones[0].setpoints.cool;
            const characteristic=this.parseMode(data.zones[0].current_zone_mode);

            if(f && characteristic==Characteristic.TargetHeatingCoolingState.AUTO) {
                const convertedScale = this.getConvertedScale(data);
                
                let c=f;
                if(convertedScale === Characteristic.TemperatureDisplayUnits.FAHRENHEIT) {
                    c = this.ftoc(c);
                }

				this.log("Cooling Threshold Temperature : %s", c);
				
                // callback(null, c);
                callback(null, c);
                this.service.updateCharacteristic(Characteristic.HeatingThresholdTemperature, c);
    
            } else {
                // callback(null, 30.0);
                callback(null, 30.0);
                this.service.updateCharacteristic(Characteristic.HeatingThresholdTemperature, 30.0);
    
            }
        } else {
            callback(null);
        }        
    },
    setCoolingThresholdTemperature: async function(value, callback) {
        this.log("setCoolingThresholdTemperature to " + value);

        // set cooling and heating threshold temperature are calling sametime when control tempature in auto mode.
        // and cooling threshold temperature is called first.

        this.coolingThreshold=value;

        callback(null);
       
    },
    getHeatingThresholdTemperature: async function(callback) {
        this.log("getHeatingThresholdTemperature");

        const data=await this.getDefaultInfo();

        if(data!==false) {
            
            const f=data.zones[0].setpoints.heat;
            const characteristic=this.parseMode(data.zones[0].current_zone_mode);

            if(f && characteristic==Characteristic.TargetHeatingCoolingState.AUTO) {

                const convertedScale = this.getConvertedScale(data);
                
                let c=f;
                if(convertedScale === Characteristic.TemperatureDisplayUnits.FAHRENHEIT) {
                    c = this.ftoc(c);
                }
                this.log("Heating Threshold Temperature : %s", c);
                // callback(null, c);
                callback(null, c);
                this.service.updateCharacteristic(Characteristic.HeatingThresholdTemperature, c);
            } else {
                callback(null, 24);
            }
        } else {
            callback(null);
        }
    },
    setHeatingThresholdTemperature: async function(value, callback) {
        this.log("setHeatingThresholdTemperature to " + value);

        const data=await this.getDefaultInfo();

        if(data!==false) {

            const rawMode=data.zones[0].current_zone_mode;

            if(rawMode==='AUTO') {

                const payload=this.makePointPayload(data, 'heat', value);  
                
                const convertedScale = this.getConvertedScale(data);

                if(this.coolingThreshold) {
                    let tem=this.coolingThreshold;
            
                    if(convertedScale === Characteristic.TemperatureDisplayUnits.FAHRENHEIT) {
                        tem = this.ctof(tem);
            
                        this.log("C to F : %s", tem);
                    } else {
                        tem = tem.toFixed(1);
                    }
                                    
                    payload.cool=tem;
                }
                        
                this.postPoints(data, payload, callback);
                // callback(null);
            } else {
                callback(null);
            }


        } else {
            callback(null);
        }        
    },
    getStateHumidity: async function(callback) {
        const data=await this.getDefaultInfo();

        if(data!==false) {
            const humidify = data.indoor_humidity;

            callback(null, humidify);
        } else {
            callback(null);
        }
    },

    _getStatus: async function(callback) {
        const data=await this.getDefaultInfo();

        if(data!==false) {
            const humidity = data.indoor_humidity;
            const f=data.zones[0].temperature;

            const convertedScale = this.getConvertedScale(data);
            
            let c=f;
            if(convertedScale === Characteristic.TemperatureDisplayUnits.FAHRENHEIT) {
                c = this.ftoc(c);
            }
            this.service.updateCharacteristic(Characteristic.CurrentTemperature, c);
            this.humidityService.updateCharacteristic(Characteristic.CurrentRelativeHumidity, humidity);

            callback();
        } else {
            callback();
        }        
    },
    getName: function(callback) {
        this.log("getName :", this.name);
        var error = null;
        callback(error, this.name);
    },

    getServices: function() {

		let services=[];

        // you can OPTIONALLY create an information service if you wish to override
        // the default values for things like serial number, model, etc.
        var informationService = new Service.AccessoryInformation();

        informationService
            .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
            .setCharacteristic(Characteristic.Model, this.model)
            .setCharacteristic(Characteristic.SerialNumber, this.serialNumber);



        // Required Characteristics
        this.service
            .getCharacteristic(Characteristic.CurrentHeatingCoolingState)
            .on('get', this.getCurrentHeatingCoolingState.bind(this));
            // .on('set', this.setCurrentHeatingCoolingState.bind(this));

        this.service
            .getCharacteristic(Characteristic.TargetHeatingCoolingState)
            .on('get', this.getTargetHeatingCoolingState.bind(this))
            .on('set', this.setTargetHeatingCoolingState.bind(this));

        this.service
            .getCharacteristic(Characteristic.CurrentTemperature)
            .on('get', this.getCurrentTemperature.bind(this));

        this.service
            .getCharacteristic(Characteristic.TargetTemperature)
            .on('get', this.getTargetTemperature.bind(this))
            .on('set', this.setTargetTemperature.bind(this));

        this.service
            .getCharacteristic(Characteristic.TemperatureDisplayUnits)
            .on('get', this.getTemperatureDisplayUnits.bind(this))
            .on('set', this.setTemperatureDisplayUnits.bind(this));

        // Optional Characteristics
        this.service
            .getCharacteristic(Characteristic.CoolingThresholdTemperature)
            .on('get', this.getCoolingThresholdTemperature.bind(this))
            .on('set', this.setCoolingThresholdTemperature.bind(this));


        this.service
            .getCharacteristic(Characteristic.HeatingThresholdTemperature)
            .on('get', this.getHeatingThresholdTemperature.bind(this))
            .on('set', this.setHeatingThresholdTemperature.bind(this));

        this.service
            .getCharacteristic(Characteristic.Name)
            .on('get', this.getName.bind(this));


        // huminity

        this.humidityService
            .getCharacteristic(Characteristic.CurrentRelativeHumidity)
            .setProps({minValue: 0, maxValue: 100})
            .on('get', this.getStateHumidity.bind(this));        

        setInterval(function () {
            this._getStatus(function () {})
        }.bind(this), this.pollInterval * 1000);

        services.push(informationService);
        services.push(this.service);
        services.push(this.humidityService);

        return services;
    }
};
