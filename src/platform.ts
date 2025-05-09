import type { API, Characteristic, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig, Service } from 'homebridge';

import { DimmerAccessory } from './device_types/dimmer.js';
import { SwitchAccessory } from './device_types/switch.js';
import { ToggleAccessory } from './device_types/toggle.js';
import { SimpleThermostatAccessory } from './device_types/simple_thermostat.js';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';

import { Socket } from 'net';

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class ExampleHomebridgePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: Map<string, PlatformAccessory> = new Map();

  socket = new Socket;
  socket_buffer = '';

  pong_timeout = () => {
    this.socket.destroy();
  };
  
  pong_timer = setTimeout(this.pong_timeout, 15000);

  ping_timeout = () => {
    this.enqueue('Lighting_controller::Ping()');
    this.pong_timer = setTimeout(this.pong_timeout, 15000);
    this.ping_timer = setTimeout(this.ping_timeout, 30000);
  };
  
  ping_timer = setTimeout(this.ping_timeout, 30000);

  queue : string[] = [];
  queue_ready = false;

  dimmers = {};
  switches = {};
  toggles = {};
  simple_thermostats = {};

  thermostat_map: Map<string, string> = new Map();

  constructor(
    public readonly log: Logging,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

    clearTimeout(this.ping_timer);
    clearTimeout(this.pong_timer);

    this.log.debug('Finished initializing platform:', this.config.name);

    this.socket.setEncoding('utf8');
    this.socket.on('close', this.on_close.bind(this));
    //this.socket.on('connect', this.on_connect.bind(this));
    this.socket.on('data', this.on_data.bind(this));
    this.socket.on('drain', this.on_drain.bind(this));
    //this.socket.on('end', this.on_end.bind(this));
    this.socket.on('error', this.on_error.bind(this));
    //this.socket.on('loopkup', this.on_lookup.bind(this));
    this.socket.on('ready', this.on_ready.bind(this));
    this.socket.on('timeout', this.on_timeout.bind(this));

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      this.discoverDevices();
      this.socket.connect(12323);
    });
  }

  reconnect() {
    this.socket.connect(12323);
  }

  on_close() {
    clearTimeout(this.ping_timer);
    clearTimeout(this.pong_timer);
    this.log.error('close');
    setTimeout(this.reconnect.bind(this), 10000);
  }

  // on_connect() {
  //   this.log.error('connect');
  // }

  on_data(data: string) {
    this.socket_buffer += data;
    //this.log.error('data "', data, '"');
    let index = this.socket_buffer.indexOf('\n');
    while (index !== -1) {
      const line = this.socket_buffer.substring(0, index);
      this.log.error('read', line);
      const dimmer_set_matcher = /Lighting_controller::DimmerSet\(Address1 = (.*), DimmerLevel = (.*), FadeTime = (.*)\)/;
      const dimmer_set_matched = dimmer_set_matcher.exec(line);
      if (dimmer_set_matched !== null) {
        //this.log.error('dimmer_set', dimmer_set_matched[1], dimmer_set_matched[2]);
        if (this.dimmers[dimmer_set_matched[1]] !== undefined) {
          this.dimmers[dimmer_set_matched[1]].updateLevel(parseInt(dimmer_set_matched[2], 10));
        }
      }
      const switch_matcher = /Lighting_controller::Switch(.*)\(Address1 = (.*)\)/;
      const switch_matched= switch_matcher.exec(line);
      if (switch_matched !== null) {
        if (switch_matched[1] === 'On') {
          //this.log.error('switch_on', switch_matched[2]);
          if (this.switches[switch_matched[2]] !== undefined) {
            this.switches[switch_matched[2]].updateOn(true);
          }
          if (this.toggles[switch_matched[2]] !== undefined) {
            this.toggles[switch_matched[2]].updateOn(true);
          }
          if (this.simple_thermostats[switch_matched[2]] !== undefined) {
            this.simple_thermostats[switch_matched[2]].updateOn(true);
          }
        }
        if (switch_matched[1] === 'Off') {
          //this.log.error('switch_off', switch_matched[2]);
          if (this.switches[switch_matched[2]] !== undefined) {
            this.switches[switch_matched[2]].updateOn(false);
          }
          if (this.toggles[switch_matched[2]] !== undefined) {
            this.toggles[switch_matched[2]].updateOn(false);
          }
          if (this.simple_thermostats[switch_matched[2]] !== undefined) {
            this.simple_thermostats[switch_matched[2]].updateOn(false);
          }
        }
      }
      
      const ping_matcher = /Lighting_controller::Ping\(\)/;
      const ping_matched= ping_matcher.exec(line);
      if (ping_matched !== null) {
        //this.log.error('ping');
        this.enqueue('Lighting_controller::Pong()');
      }

      const pong_matcher = /Lighting_controller::Pong\(\)/;
      const pong_matched= pong_matcher.exec(line);
      if (pong_matched !== null) {
        clearTimeout(this.pong_timer);
      }

      //Measurement(Device+Channel = 0+3, Units = 0, Value = 23.31)
      const measurement_matcher = /Measurement\(Device\+Channel = (.*), Units = (.*), Value = (.*)\)/;
      const measurement_matched = measurement_matcher.exec(line);
      if (measurement_matched !== null) {
        //this.log.error('measurement', measurement_matched[1], measurement_matched[2], measurement_matched[3]);
        const a = this.thermostat_map[measurement_matched[1]];
        if (a !== undefined) {
          if (this.simple_thermostats[a] !== undefined) {
            this.simple_thermostats[a].update_thermostat(parseFloat(measurement_matched[3]));
          }
        }
      }

      //this.log.error('remaining "', this.socket_buffer.substring(index + 1), '"');
      this.socket_buffer = this.socket_buffer.substring(index + 1);
      index = this.socket_buffer.indexOf('\n');
    }
  }

  on_drain() {
    this.log.error('drain');
    this.queue_ready = true;
    while (this.queue.length > 0 && this.queue_ready) {
      this.queue_ready = this.socket.write(this.queue.shift()!);
    }
  }

  // on_end() {
  //   this.log.error('end');
  // }

  on_error() {
    this.log.error('error');
    this.socket.destroy();
  }

  // on_lookup() {
  //   this.log.error('lookup');
  // }

  on_ready() {
    this.ping_timer = setTimeout(this.ping_timeout, 30000);
    this.log.error('ready');
    this.enqueue('Lighting_controller::Configure(Lighting_Address = ' + this.config.lighting_address + ')');
    for (const address in this.dimmers) {
      this.enqueue('Lighting_controller::ConfigureDimmer(Address1 = ' + address + ')');
    }
    for (const address in this.switches) {
      this.enqueue('Lighting_controller::ConfigureSwitch(Address1 = ' + address + ')');
    }
    for (const address in this.toggles) {
      this.enqueue('Lighting_controller::ConfigureSwitch(Address1 = ' + address + ')');
    }
    for (const address in this.simple_thermostats) {
      this.enqueue('Lighting_controller::ConfigureSwitch(Address1 = ' + address + ')');
    }
    this.on_drain();
  }

  on_timeout() {
    this.log.error('timeout');
    this.socket.destroy();
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.set(accessory.UUID, accessory);
  }

  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  discoverDevices() {

    // loop over the discovered devices and register each one if it has not already been registered
    for (const device of this.config.lighting_table) {

      // generate a unique id for the accessory this should be generated from
      // something globally unique, but constant, for example, the device serial
      // number or MAC address
      this.log.error('lighting_table[].name', device.name);
      this.log.error('lighting_table[].device_type', device.device_type);
      this.log.error('lighting_table[].address', device.address);
      const uuid = this.api.hap.uuid.generate(device.device_type + device.address);

      // see if an accessory with the same uuid has already been registered and restored from
      // the cached devices we stored in the `configureAccessory` method above
      const existingAccessory = this.accessories.get(uuid);

      if (existingAccessory) {
        // the accessory already exists
        this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        // existingAccessory.context.device = device;
        // this.api.updatePlatformAccessories([existingAccessory]);

        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        if (device.device_type === 'Dimmer') {
          this.dimmers[device.address] = new DimmerAccessory(this, existingAccessory);
        }
        if (device.device_type === 'Switch') {
          this.switches[device.address] = new SwitchAccessory(this, existingAccessory);
        }
        if (device.device_type === 'Toggle') {
          this.toggles[device.address] = new ToggleAccessory(this, existingAccessory);
        }
        if (device.device_type === 'SimpleThermostat') {
          this.simple_thermostats[device.address] = new SimpleThermostatAccessory(this, existingAccessory);
        }

        // it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, eg.:
        // remove platform accessories when no longer present
        // this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
        // this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
      } else {
        // the accessory does not yet exist, so we need to create it
        this.log.info('Adding new accessory:', device.name);

        // create a new accessory
        const accessory = new this.api.platformAccessory(device.name, uuid);

        // store a copy of the device object in the `accessory.context`
        // the `context` property can be used to store any data about the accessory you may need
        accessory.context.device = device;

        // create the accessory handler for the newly create accessory
        // this is imported from `platformAccessory.ts`
        if (device.device_type === 'Dimmer') {
          this.dimmers[device.address] = new DimmerAccessory(this, accessory);
        }
        if (device.device_type === 'Switch') {
          this.switches[device.address] = new SwitchAccessory(this, accessory);
        }
        if (device.device_type === 'Toggle') {
          this.toggles[device.address] = new ToggleAccessory(this, accessory);
        }
        if (device.device_type === 'SimpleThermostat') {
          this.simple_thermostats[device.address] = new SimpleThermostatAccessory(this, accessory);
        }

        // link the accessory to your platform
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }

      if (device.device_type === 'SimpleThermostat') {
        const measurement_matcher = /.*;\s*measurement\s*=\s*([^;]+).*/;
        const measurement_matched = measurement_matcher.exec(device.address);
        if (measurement_matched !== null) {
          let m = measurement_matched[1];
          m = m.replaceAll(/\s/g, '');
          this.log.info(device.address, '->', m);
          this.thermostat_map[m] = device.address;
        }    
      }

    }
  }

  enqueue(data: string) {
    this.log.error('write', data);
    this.queue.push(data + '\n');
    if (this.queue_ready) {
      this.queue_ready = this.socket.write(this.queue.shift()!);
    }
  }
}
