import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { SwitchAccessory } from './device_types/switch';
import { DimmerAccessory } from './device_types/dimmer';
import { Socket } from 'net';
import { isNull } from 'util';

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class ExampleHomebridgePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  socket = new Socket;
  socket_buffer = '';

  switches = {};
  dimmers = {};

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('Finished initializing platform:', this.config.name);

    this.socket.setEncoding('utf8');
    this.socket.on('connect', this.on_connect.bind(this))
    this.socket.on('data', this.on_data.bind(this))
    this.socket.connect(12323);

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      this.discoverDevices();
    });
  }
  on_connect() {
    this.log.error('connect');
    this.socket.write(this.config.lighting_address + "\n");
  }

  on_data(data: String) {
    this.socket_buffer += data;
    this.log.error('data "', data, '"');
    const matcher = /([^\n]*)\n(.*)/;
    var matched = matcher.exec(data.toString());
    if (matched != null) {
      this.log.error('line "', matched[1], '"');
      const dimmer_set_matcher = /Lighting_controller::DimmerSet\(Address1 = (.*), DimmerLevel = (.*), FadeTime = (.*)\)/
      var dimmer_set_matched = dimmer_set_matcher.exec(matched[1]);
      if (dimmer_set_matched != null) {
        this.log.error('dimmer_set', dimmer_set_matched[1], dimmer_set_matched[2]);
        if (this.dimmers[dimmer_set_matched[1]] != undefined) {
          this.dimmers[dimmer_set_matched[1]].updateLevel(dimmer_set_matched[2]);
        }
    }
      const switch_matcher = /Lighting_controller::Switch(.*)\(Address1 = (.*)\)/
      var switch_matched= switch_matcher.exec(matched[1]);
      if (switch_matched != null) {
        if (switch_matched[1] == 'On') {
          this.log.error('switch_on', switch_matched[2]);
          if (this.switches[switch_matched[2]] != undefined) {
            this.switches[switch_matched[2]].updateOn(true);
          }
        }
        if (switch_matched[1] == 'Off') {
          this.log.error('switch_off', switch_matched[2]);
          if (this.switches[switch_matched[2]] != undefined) {
            this.switches[switch_matched[2]].updateOn(false);
          }
        }
      }

      this.log.error('remaining "', matched[2], '"');
      this.socket_buffer = matched[2];
    }
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
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
      const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

      if (existingAccessory) {
        // the accessory already exists
        this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        // existingAccessory.context.device = device;
        // this.api.updatePlatformAccessories([existingAccessory]);

        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        if (device.device_type == 'Switch') this.switches[device.address] = new SwitchAccessory(this, existingAccessory);
        if (device.device_type == 'Dimmer') this.dimmers[device.address] = new DimmerAccessory(this, existingAccessory);

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
        if (device.device_type == 'Switch') this.switches[device.address] = new SwitchAccessory(this, accessory);
        if (device.device_type == 'Dimmer') this.dimmers[device.address] = new DimmerAccessory(this, accessory);

        // link the accessory to your platform
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }
  }
}
