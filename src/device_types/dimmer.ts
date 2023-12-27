import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';

import { ExampleHomebridgePlatform } from '../platform';

export class DimmerAccessory {
  private service: Service;

  private lighting_state = {
    power: false,
    valid_power: false,
    level: 100,
    valid_level: false,
  };

  queue : number[] = [];
  queue_ready = true;

  constructor(
    private readonly platform: ExampleHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Default-Manufacturer')
      .setCharacteristic(this.platform.Characteristic.Model, 'Default-Model')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, 'Default-Serial');

    this.service = this.accessory.getService(this.platform.Service.Lightbulb) || this.accessory.addService(this.platform.Service.Lightbulb);

    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name);

    this.service.getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setOn.bind(this)).onGet(this.getOn.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.Brightness)
      .onSet(this.setBrightness.bind(this)).onGet(this.getBrightness.bind(this));
  }

  updateLevel(level: number) {
    this.platform.log.error('queueing', level);
    this.queue.push(level);
    this.process_queue();
  }

  async setOn(value: CharacteristicValue) {
    this.platform.log.error(this.accessory.context.device.name, 'Set Characteristic On -> ', value);

    this.lighting_state.power = value as boolean;
    this.lighting_state.valid_power = false;
    if (value) {
      this.platform.enqueue('Lighting_controller::DimmerSet(Address1 = ' + this.accessory.context.device.address
      + ', DimmerLevel = ' + this.lighting_state.level + ', FadeTime = )');
    } else {
      this.platform.enqueue('Lighting_controller::DimmerSet(Address1 = ' + this.accessory.context.device.address
      + ', DimmerLevel = 0, FadeTime = )');
    }
  }

  async setBrightness(value: CharacteristicValue) {
    this.platform.log.error(this.accessory.context.device.name, 'Set Characteristic Brightness -> ', value);

    this.lighting_state.level = value as number;
    this.lighting_state.valid_level = false;
    this.platform.enqueue('Lighting_controller::DimmerSet(Address1 = ' + this.accessory.context.device.address
    + ', DimmerLevel = ' + value + ', FadeTime = )');
  }

  async getOn(): Promise<CharacteristicValue> {
    this.platform.log.error(this.accessory.context.device.name, 'Get Characteristic On ->', this.lighting_state.power);

    return this.lighting_state.power;
  }

  async getBrightness(): Promise<CharacteristicValue> {
    this.platform.log.error(this.accessory.context.device.name, 'Get Characteristic Brightness ->', this.lighting_state.level);

    return this.lighting_state.level;
  }

  process_queue() {
    if (this.queue_ready) {
      if (this.queue.length > 0) {
        const level = this.queue.shift()!;
        this.platform.log.error('unqueueing', level);

        const power = level !== 0;
        if (!this.lighting_state.valid_power || this.lighting_state.power !== power) {
          this.queue_ready = false;
          this.platform.log.error(this.accessory.context.device.name, 'Update Characteristic On ->', power);
          this.lighting_state.power = power;
          this.lighting_state.valid_power = true;
          this.service.updateCharacteristic(this.platform.Characteristic.On, power);
        }
        if (power) {
          if (!this.lighting_state.valid_level || this.lighting_state.level !== level) {
            this.queue_ready = false;
            this.platform.log.error(this.accessory.context.device.name, 'Update Characteristic Brightness ->', level);
            this.lighting_state.level = level;
            this.lighting_state.valid_level = true;
            this.service.updateCharacteristic(this.platform.Characteristic.Brightness, level);
          }
        }

        this.queue_ready = true;
        /*if (!this.queue_ready) {
          setTimeout(() => {
            this.queue_ready = true;
            this.process_queue();
          }, 500);
        }*/
      }
    }
  }
}
