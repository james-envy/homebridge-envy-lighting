import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';

import { ExampleHomebridgePlatform } from '../platform';

export class SwitchAccessory {
  private service: Service;

  private lighting_state = {
    power: false,
    valid_power: false,
  };

  queue : boolean[] = [];
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
  }

  updateOn(power: boolean) {
    this.platform.log.error('queueing', power);
    this.queue.push(power);
    this.process_queue();
  }

  async setOn(value: CharacteristicValue) {
    this.platform.log.debug(this.accessory.context.device.name, 'Set Characteristic On ->', value);

    this.lighting_state.power = value as boolean;
    this.lighting_state.valid_power = false;
    this.platform.enqueue('Lighting_controller::Switch' + (value ? 'On' : 'Off') + '(Address1 = '
    + this.accessory.context.device.address + ')');

  }

  async getOn(): Promise<CharacteristicValue> {
    this.platform.log.debug(this.accessory.context.device.name, 'Get Characteristic On ->', this.lighting_state.power);

    return this.lighting_state.power;
  }

  process_queue() {
    if (this.queue_ready) {
      if (this.queue.length > 0) {
        const power = this.queue.shift()!;
        this.platform.log.error('unqueueing', power);

        if (!this.lighting_state.valid_power || this.lighting_state.power !== power) {
          this.queue_ready = false;
          this.lighting_state.power = power;
          this.lighting_state.valid_power = true;
          this.service.getCharacteristic(this.platform.Characteristic.On).updateValue(power);
        }

        if (!this.queue_ready) {
          setTimeout(() => {
            this.queue_ready = true;
            this.process_queue();
          }, 500);
        }
      }
    }
  }
}
