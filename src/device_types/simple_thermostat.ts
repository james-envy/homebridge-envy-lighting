import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';

import { ExampleHomebridgePlatform } from '../platform';

export class SimpleThermostatAccessory {
  private service: Service;
  
  private thermostat_state = {
    mode: 'Off',
    valid_mode: false,
    thermostat: 25.0,
    valid_thermostat: false,
    timestamp_thermostat: 0,
    setpoint: 25.0,
    valid_setpoint: false,
    
    power: false,
    valid_power: false,
  };
  
  queue : number[] = [];
  queue_ready = true;
  
  constructor(
    private readonly platform: ExampleHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    if (this.accessory.context.mode !== undefined) {
      this.thermostat_state.mode = this.accessory.context.mode;
      this.thermostat_state.valid_mode = true;
    }
    if (this.accessory.context.setpoint !== undefined) {
      this.thermostat_state.setpoint = this.accessory.context.setpoint;
      this.thermostat_state.valid_setpoint = true;
    }

    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Default-Manufacturer')
      .setCharacteristic(this.platform.Characteristic.Model, 'Default-Model')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, 'Default-Serial');
    
    this.service = this.accessory.getService(this.platform.Service.Thermostat)
    || this.accessory.addService(this.platform.Service.Thermostat);
    
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name);
    
    this.service.getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState)
      .onGet(this.getCurrentHeatingCoolingState.bind(this));
    
    this.service.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState)
      .onGet(this.getTargetHeatingCoolingState.bind(this)).onSet(this.setTargetHeatingCoolingState.bind(this));
    
    this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .onGet(this.getCurrentTemperature.bind(this));
    
    this.service.getCharacteristic(this.platform.Characteristic.TargetTemperature)
      .onGet(this.getTargetTemperature.bind(this)).onSet(this.setTargetTemperature.bind(this));
    
    {
      let valid_values = this.service.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState).props.validValues;
      this.platform.log.error('TargetHeatingCoolingState old valid_values', valid_values);
      
      valid_values = valid_values?.filter(value => value !== this.platform.Characteristic.TargetHeatingCoolingState.COOL);
      valid_values = valid_values?.filter(value => value !== this.platform.Characteristic.TargetHeatingCoolingState.AUTO);
      
      this.platform.log.error('TargetHeatingCoolingState new valid_values', valid_values);
      this.service.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState).props.validValues = valid_values;
    }
    
    {
      let valid_values = this.service.getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState).props.validValues;
      this.platform.log.error('CurrentHeatingCoolingState old valid_values', valid_values);
      
      valid_values = valid_values?.filter(value => value !== this.platform.Characteristic.CurrentHeatingCoolingState.COOL);
      
      this.platform.log.error('CurrentHeatingCoolingState new valid_values', valid_values);
      this.service.getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState).props.validValues = valid_values;
    }
  }
  
  async getCurrentHeatingCoolingState(): Promise<CharacteristicValue> {
    this.platform.log.error(this.accessory.context.device.name, 'Get CurrentHeatingCoolingState ->', this.thermostat_state.mode);
    
    switch(this.thermostat_state.power) {
    case true:
      return this.platform.Characteristic.CurrentHeatingCoolingState.HEAT;
      
    default:
      return this.platform.Characteristic.CurrentHeatingCoolingState.OFF;
    }
  }
  
  async getTargetHeatingCoolingState(): Promise<CharacteristicValue> {
    const value = this.thermostat_state.mode;
    this.platform.log.error(this.accessory.context.device.name, 'Get TargetHeatingCoolingState ->', value);
    
    switch(value) {
    case 'Heat':
      return this.platform.Characteristic.TargetHeatingCoolingState.HEAT;
      
    default:
      return this.platform.Characteristic.TargetHeatingCoolingState.OFF;
    }
  }
  
  async setTargetHeatingCoolingState(value: CharacteristicValue) {
    this.platform.log.error(this.accessory.context.device.name, 'Set TargetHeatingCoolingState -> ', value);
    
    switch (value as number) {
    case this.platform.Characteristic.TargetHeatingCoolingState.OFF:
      this.thermostat_state.mode = 'Off';
      break;
      
    case this.platform.Characteristic.TargetHeatingCoolingState.HEAT:
      this.thermostat_state.mode = 'Heat';
      break;
    }
    this.thermostat_state.valid_mode = true;
    this.accessory.context.mode = this.thermostat_state.mode;
    
    this.process_state();
  }
  
  async getCurrentTemperature(): Promise<CharacteristicValue> {
    const value = this.thermostat_state.thermostat;
    this.platform.log.error(this.accessory.context.device.name, 'Get CurrentTemperature ->', value);
    
    return value;
  }
  
  async getTargetTemperature(): Promise<CharacteristicValue> {
    const value = this.thermostat_state.setpoint;
    this.platform.log.error(this.accessory.context.device.name, 'Get TargetTemperature ->', value);
    
    return value;
  }
  
  async setTargetTemperature(value: CharacteristicValue) {
    this.platform.log.error(this.accessory.context.device.name, 'Set TargetTemperature -> ', value);
    
    this.thermostat_state.setpoint = value as number;
    this.thermostat_state.valid_setpoint = true;
    this.accessory.context.setpoint = this.thermostat_state.setpoint;
    
    this.process_state();
  }
  
  update_thermostat(thermostat: number) {
    this.platform.log.error(this.accessory.context.device.name, 'Update thermostat ->', thermostat);
    
    this.thermostat_state.thermostat = thermostat;
    this.thermostat_state.valid_thermostat = true;
    this.thermostat_state.timestamp_thermostat = Date.now();
    
    this.service.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, thermostat);
    
    this.process_state();
  }
  
  updateOn(power: boolean) {
    this.platform.log.error(this.accessory.context.device.name, 'Update power ->', power);
    
    /*if (power && this.thermostat_state.mode !== 'Heat') {
      this.setTargetHeatingCoolingState(this.platform.Characteristic.TargetHeatingCoolingState.HEAT);
      this.service.updateCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState,this.platform.Characteristic.TargetHeatingCoolingState.HEAT);

    }
    if (!power && this.thermostat_state.mode === 'Heat' && this.thermostat_state.power) {
      this.setTargetHeatingCoolingState(this.platform.Characteristic.TargetHeatingCoolingState.OFF);
      this.service.updateCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState,this.platform.Characteristic.TargetHeatingCoolingState.OFF);
    }*/

    this.thermostat_state.power = power;
    this.thermostat_state.valid_power = true;  
  
    this.process_state();
  }
  
  process_state() {
    this.platform.log.error(this.accessory.context.device.name, 'mode', this.thermostat_state.mode);
    this.platform.log.error(this.accessory.context.device.name, 'valid_mode', this.thermostat_state.valid_mode);
    this.platform.log.error(this.accessory.context.device.name, 'thermostat', this.thermostat_state.thermostat);
    this.platform.log.error(this.accessory.context.device.name, 'valid_thermostat', this.thermostat_state.valid_thermostat);
    this.platform.log.error(this.accessory.context.device.name, 'setpoint', this.thermostat_state.setpoint);
    this.platform.log.error(this.accessory.context.device.name, 'valid_setpoint', this.thermostat_state.valid_setpoint);
    this.platform.log.error(this.accessory.context.device.name, 'power', this.thermostat_state.power);
    this.platform.log.error(this.accessory.context.device.name, 'valid_power', this.thermostat_state.valid_power);

    const power = this.thermostat_state.power;
    let value = power;
    
    if (this.thermostat_state.valid_thermostat) {
      if (Date.now() < this.thermostat_state.timestamp_thermostat) {
        this.thermostat_state.valid_thermostat = false;
      }
      if (Date.now() > (this.thermostat_state.timestamp_thermostat + 900000)) {
        this.thermostat_state.valid_thermostat = false;
      }
    }

    if (this.thermostat_state.valid_mode && this.thermostat_state.valid_thermostat && this.thermostat_state.valid_setpoint) {
      switch(this.thermostat_state.mode) {
      case 'Heat':
        if (this.thermostat_state.thermostat >= (this.thermostat_state.setpoint + 1.0)) {
          value = false;
        }
        if (this.thermostat_state.thermostat <= (this.thermostat_state.setpoint - 1.0)) {
          value = true;
        }
        break;
        
      default:
        value = false;
      }
    } else {
      value = false;
    }
    if ((value !== power) || (!this.thermostat_state.valid_power)) {
      this.thermostat_state.power = value;
      this.thermostat_state.valid_power = true;
      this.platform.log.debug('Switching power to ->', value);
      this.platform.enqueue('Lighting_controller::Switch' + (value ? 'On' : 'Off') + '(Address1 = '
      + this.accessory.context.device.address + ')');

      const c = value ? this.platform.Characteristic.CurrentHeatingCoolingState.HEAT : this.platform.Characteristic.CurrentHeatingCoolingState.OFF;
      this.service.updateCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState, c);
    }
  }
}
