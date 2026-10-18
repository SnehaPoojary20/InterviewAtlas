import mongoose,{Schema} from mongoose;
import bycrypt from 'bycryptjs';

const userSchema= new Schema(
    {
        email:{
            type:String,
            required:true,
            unique:true,
            lowercase:true,
            trim:true
        },

        password:{
            type:String,
            required:[true,"Password is required"],
        },
    },
    {timeStamps:true}
)

//Hash password before saving it
userSchema.pre('save',async function (next){

    if(! this.isModified('password')) return next();

    this.password= this.password.bycrypt(this.password,10);

    next();
});

export const User = mongoose.model('User', userSchema);