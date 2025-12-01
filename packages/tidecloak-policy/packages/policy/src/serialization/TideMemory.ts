export class TideMemory extends Uint8Array{
    static CreateFromArray(datas: Uint8Array[]): TideMemory   {
        const length = datas.reduce((sum, next) => sum + 4 + next.length, 0);
        const mem = this.Create(datas[0], length);
        for(let i = 1; i < datas.length; i++){
            mem.WriteValue(i, datas[i]);
        }
        return mem;
    }
    static Create(initialValue: Uint8Array, totalLength: number, version: number = 1): TideMemory {
        if (totalLength < initialValue.length + 4) {
            throw new Error("Not enough space to allocate requested data. Make sure to request more space in totalLength than length of InitialValue plus 4 bytes for length.");
        }

        // Total buffer length is 4 (version) + totalLength
        const bufferLength = 4 + totalLength;
        const buffer = new TideMemory(bufferLength);
        const dataView = new DataView(buffer.buffer);

        // Write version at position 0 (4 bytes)
        dataView.setInt32(0, version, true); // true for little-endian

        let dataLocationIndex = 4;

        // Write data length of initialValue at position 4 (4 bytes)
        dataView.setInt32(dataLocationIndex, initialValue.length, true);
        dataLocationIndex += 4;

        // Write initialValue starting from position 8
        buffer.set(initialValue, dataLocationIndex);

        return buffer;
    }
    
    WriteValue(index: number, value: Uint8Array): void {
        if (index < 0) throw new Error("Index cannot be less than 0");
        if (index === 0) throw new Error("Use CreateTideMemory to set value at index 0");
        if (this.length < 4 + value.length) throw new Error("Could not write to memory. Memory too small for this value");

        const dataView = new DataView(this.buffer);
        let dataLocationIndex = 4; // Start after the version number

        // Navigate through existing data segments
        for (let i = 0; i < index; i++) {
            if (dataLocationIndex + 4 > this.length) {
                throw new RangeError("Index out of range.");
            }

            // Read data length at current position
            const nextDataLength = dataView.getInt32(dataLocationIndex, true);
            dataLocationIndex += 4;

            dataLocationIndex += nextDataLength;
        }

        // Check if there's enough space to write the value
        if (dataLocationIndex + 4 + value.length > this.length) {
            throw new RangeError("Not enough space to write value");
        }

        // Check if data has already been written to this index
        const existingLength = dataView.getInt32(dataLocationIndex, true);
        if (existingLength !== 0) {
            throw new Error("Data has already been written to this index");
        }

        // Write data length of value at current position
        dataView.setInt32(dataLocationIndex, value.length, true);
        dataLocationIndex += 4;

        // Write value starting from current position
        this.set(value, dataLocationIndex);
    }

    GetValue(index: number): TideMemory{
        // 'a' should be an ArrayBuffer or Uint8Array
        if (this.length < 4) {
            throw new Error("Insufficient data to read.");
        }

        // Create a DataView for reading integers in little-endian format
        const dataView = new DataView(this.buffer, this.byteOffset, this.byteLength);

        // Optional: Read the version if needed
        // const version = dataView.getInt32(0, true);

        let dataLocationIndex = 4;

        for (let i = 0; i < index; i++) {
            // Check if there's enough data to read the length of the next segment
            if (dataLocationIndex + 4 > this.length) {
                throw new RangeError("Index out of range.");
            }

            const nextDataLength = dataView.getInt32(dataLocationIndex, true);
            dataLocationIndex += 4 + nextDataLength;
        }

        // Check if there's enough data to read the length of the final segment
        if (dataLocationIndex + 4 > this.length) {
            throw new RangeError("Index out of range.");
        }

        const finalDataLength = dataView.getInt32(dataLocationIndex, true);
        dataLocationIndex += 4;

        // Check if the final data segment is within bounds
        if (dataLocationIndex + finalDataLength > this.length) {
            throw new RangeError("Index out of range.");
        }

        return this.subarray(dataLocationIndex, dataLocationIndex + finalDataLength) as TideMemory;
    }
}